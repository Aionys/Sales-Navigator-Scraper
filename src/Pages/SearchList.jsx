/* eslint-disable no-undef */
import { useState, useRef } from "react";
import Papa from "papaparse";

const SearchList = () => {
  const [csvData, setCsvData] = useState("");
  const [tableSearchSheetCount, setTableSearchSheetCount] = useState(0);
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState("");
  const scrapingRef = useRef(false);

  const baseLinkedinUrl = "https://www.linkedin.com";
  const buildUrl = (path) => `${baseLinkedinUrl}${path}`;

  const fetchSearchData = async () => {
    try {
      setIsScrapingActive(true);
      scrapingRef.current = true;
      setScrapingProgress("Starting parsing...");
      
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      let hasNextPage = true;
      let pageNumber = 1;

      while (hasNextPage && scrapingRef.current) {
        setScrapingProgress(`Processing page ${pageNumber}...`);

        // Wait until at least one person's name appears
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            return new Promise((resolve) => {
              const interval = setInterval(() => {
                const nameCell = document.querySelector(
                  'li.artdeco-list__item a span[data-anonymize="person-name"]'
                );
                if (nameCell && nameCell.textContent.trim() !== "") {
                  clearInterval(interval);
                  resolve(true);
                }
              }, 500);
              // Optional: timeout after 10s just in case
              setTimeout(() => {
                clearInterval(interval);
                resolve(false);
              }, 5000);
            });
          },
        });

        // Scroll the page to load all leads
        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrollTopToBottom,
        });

        await new Promise(resolve => setTimeout(resolve, 2000)); // Wait to ensure content loads

        // Get the HTML of the table
        const response = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const tableElement = document.querySelector("ol.artdeco-list");
            if (tableElement) {
              return {
                tableHTML: tableElement.outerHTML,
              };
            }
            return { tableHTML: "No table found" };
          },
        });

        const data = response[0].result;

        if (data.tableHTML !== "No table found" && scrapingRef.current) {
          // Process all leads on the current page COMPLETELY
          await convertSearchTableToCsv(data.tableHTML, pageNumber);
        }

        // Only after fully processing all leads do we check the next page
        if (!scrapingRef.current) {
          break;
        }

        // Try clicking the "Next" button
        const nextClicked = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const nextBtn = Array.from(document.querySelectorAll("button"))
              .find(btn => btn.innerText.trim() === "Next" && !btn.disabled);
            if (nextBtn) {
              nextBtn.click();
              return true;
            }
            return false;
          },
        });

        hasNextPage = nextClicked[0].result && scrapingRef.current;

        if (hasNextPage) {
          pageNumber++;
          await new Promise(resolve => setTimeout(resolve, 2000)); // Wait after clicking next
        }
      }

      setScrapingProgress(scrapingRef.current ? "Parsing completed!" : "Parsing stopped by user");
      setIsScrapingActive(false);
      scrapingRef.current = false;

    } catch (error) {
      console.error("Error fetching data", error);
      setScrapingProgress("Error occurred while parsing");
      setIsScrapingActive(false);
      scrapingRef.current = false;
    }
  };

  const stopScraping = () => {
    scrapingRef.current = false;
    setIsScrapingActive(false);
    setScrapingProgress("Stopping parsing...");
  };

  const convertSearchTableToCsv = async (tableHTML, pageNumber) => {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = tableHTML;

      const table = tempDiv.querySelector("ol.artdeco-list");
      const rows = Array.from(table.querySelectorAll("li.artdeco-list__item"));

      console.log(`Found ${rows.length} leads on page ${pageNumber}`);
      setScrapingProgress(`Page ${pageNumber}: processing ${rows.length} leads...`);

      const headerArray = [
        "FullName",
        "LeadLocation",
        "JobTitle",
        "CompanyName",
        "CompanyLocation",
        "CompanyIndustry",
        "CompanyWebsite",
        "CompanySize"
      ];
      
      // Extract rows
      const dataArray = [];
      
      for (let i = 0; i < rows.length; i++) {
        // Check if parsing has been stopped
        if (!scrapingRef.current) {
          console.log("Parsing stopped by user");
          break;
        }

        const row = rows[i];
        setScrapingProgress(`Page ${pageNumber}: processing lead ${i + 1}/${rows.length}...`);

        try {
          // Parse lead location from the main list
          const countryCell = row?.querySelector('div span[data-anonymize="location"]');
          const leadLocation = countryCell ? countryCell.textContent.trim() : "Location not found";
          
          // Get the profile URL from the main list
          const profileHrefElement = row?.querySelector(".artdeco-entity-lockup__title a");
          const profileUrl = profileHrefElement ? buildUrl(profileHrefElement.getAttribute("href")) : null;

          let profileData = { 
            fullName: "Profile full not found", 
            roles: [{ jobTitle: "No current role", companyHref: null }] 
          };

          if (profileUrl && scrapingRef.current) {
            try {
              console.log(`Opening profile: ${profileUrl}`);
              const profileTab = await chrome.tabs.create({ url: profileUrl, active: false });
              await waitForTabLoad(profileTab.id);
              
              // Check if parsing has been stopped
              if (!scrapingRef.current) {
                await chrome.tabs.remove(profileTab.id);
                break;
              }

              await new Promise(resolve => setTimeout(resolve, 3000)); // Increase waiting time

              const profileResponse = await chrome.scripting.executeScript({
                target: { tabId: profileTab.id },
                func: parseProfile,
              });

              profileData = await profileResponse[0].result;
              console.log(`Parsed profile data:`, profileData);

              await chrome.tabs.remove(profileTab.id);
            } catch (error) {
              console.error("Error fetching profile data", error);
              profileData = { 
                fullName: "Error parsing profile", 
                roles: [{ jobTitle: "Error parsing role", companyHref: null }] 
              };
            }
          }

          // Process each role separately to create multiple records if needed
          for (let roleIndex = 0; roleIndex < profileData.roles.length; roleIndex++) {
            // Check if parsing has been stopped
            if (!scrapingRef.current) {
              break;
            }

            const role = profileData.roles[roleIndex];
            let companyDetails = {
              companyName: "Company name not found",
              companyLocation: "Location not found",
              companyIndustry: "Industry not found",
              companyWebsite: "Website not found", 
              companySize: "Size not found"
            };

            // If there's a company URL, fetch company details
            if (role.companyHref && scrapingRef.current) {
              try {
                const companyUrl = buildUrl(role.companyHref);
                console.log(`Opening company page: ${companyUrl}`);
                
                const companyTab = await chrome.tabs.create({ url: companyUrl, active: false });
                await waitForTabLoad(companyTab.id);
                
                // Check if parsing has been stopped
                if (!scrapingRef.current) {
                  await chrome.tabs.remove(companyTab.id);
                  break;
                }

                await new Promise(resolve => setTimeout(resolve, 2000)); // Wait for company page to load

                const companyResponse = await chrome.scripting.executeScript({
                  target: { tabId: companyTab.id },
                  func: parseCompanyDetails,
                });

                companyDetails = await companyResponse[0].result;
                console.log(`Parsed company details:`, companyDetails);

                await chrome.tabs.remove(companyTab.id);
              } catch (error) {
                console.error("Error fetching company data", error);
                companyDetails = {
                  companyName: "Error parsing company",
                  companyLocation: "Error parsing location",
                  companyIndustry: "Error parsing industry",
                  companyWebsite: "Error parsing website",
                  companySize: "Error parsing size"
                };
              }
            }

            // Random delay between processing
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            const rowData = [
              profileData.fullName,
              leadLocation,
              role.jobTitle,
              companyDetails.companyName,
              companyDetails.companyLocation,
              companyDetails.companyIndustry,
              companyDetails.companyWebsite,
              companyDetails.companySize
            ];

            dataArray.push(rowData);
            console.log(`Processed lead ${i + 1}/${rows.length}, role ${roleIndex + 1}/${profileData.roles.length}: ${profileData.fullName} - ${role.jobTitle}`);
          }        } catch (error) {
          console.error(`Error processing lead:`, error);
          // Add error row to avoid losing data
          const rowData = [
            "Error parsing lead",
            "Error parsing location",
            "Error parsing role",
            "Error parsing company",
            "Error parsing website",
            "Error parsing size"
          ];
          dataArray.push(rowData);
        }
      }

      // Save data after processing each page
      if (dataArray.length > 0) {
        const previousData = await new Promise((resolve) => {
          chrome.storage.local.get(["scrapedData"], (result) => {
            resolve(result.scrapedData || []);
          });
        });

        const isHeaderIncluded =
          previousData.length > 0 &&
          previousData[0].every((header, index) => header === headerArray[index]);

        const combinedData = isHeaderIncluded
          ? [...previousData, ...dataArray]
          : [headerArray, ...previousData, ...dataArray];

        chrome.storage.local.set({ scrapedData: combinedData });

        setTableSearchSheetCount(combinedData.length - 1);
        console.log(`Saved ${dataArray.length} new leads. Total in database: ${combinedData.length - 1}`);
        setScrapingProgress(`Page ${pageNumber} completed. Leads processed: ${dataArray.length}. Total: ${combinedData.length - 1}`);
      }
      
    } catch (error) {
      console.error("Error converting table to CSV", error);
      setScrapingProgress(`Error on page ${pageNumber}: ${error.message}`);
    }
  };

  const unperseSearchData = async () => {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["scrapedData"], (result) => {
        resolve(result.scrapedData || []);
      });
    });

    if (data.length > 0) {
      const csv = Papa.unparse(data);
      setCsvData(csv);
    } else {
      console.error("No data available to convert to CSV");
    }
  };

  const downloadSearchCsv = () => {
    if (!csvData) {
      console.error("No CSV data available for download");
      return;
    }

    const blob = new Blob([csvData], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "linkedin_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  const clearSearchData = () => {
    chrome.storage.local.remove("scrapedData", () => {
      setCsvData("");
      setTableSearchSheetCount(0);
    });
  };

  const scrollTopToBottom = async () => {
    return new Promise((resolve) => {
      let totalHeight = 0;
      const distance = 200;
      const scrollDelay = 100;
      const container = document.getElementById("search-results-container"); // Target the specific div

      if (!container) {
        console.warn("Scroll container not found!");
        resolve();
        return;
      }

      container.scrollBy(0, container.scrollHeight * (-1));

      const timer = setInterval(() => {
        const scrollHeight = container.scrollHeight;
        container.scrollBy(0, distance);
        totalHeight += distance;

        if (totalHeight >= scrollHeight - container.clientHeight) {
          clearInterval(timer);
          setTimeout(resolve, 1000);
        }
      }, scrollDelay);
    });
  };

  async function waitForTabLoad(tabId) {
    return new Promise((resolve) => {
      const listener = (updatedTabId, changeInfo) => {
        if (updatedTabId === tabId && changeInfo.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          resolve();
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
      // Timeout in case of error
      setTimeout(() => {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(); // Continue even if timeout
      }, 15000); // Increased timeout to 15 seconds
    });
  }

  // Company details parsing function (injected)
  function parseCompanyDetails() {
    return new Promise((resolve) => {
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkForCompanyDetails = () => {
        attempts++;
        
        // Parse company name
        const companyNameElement = document.querySelector('div[data-anonymize="company-name"]');
        const companyName = companyNameElement ? companyNameElement.textContent.trim() : "Company name not found";
        
        // Parse company website
        let companyWebsite = "Website not found";
        const websiteElement = document.querySelector('a[data-control-name="visit_company_website"]');
        if (websiteElement) {
          companyWebsite = websiteElement.getAttribute('href') || "Website not found";
        }
        
        // Parse company size
        let companySize = "Size not found";
        const sizeElement = document.querySelector('div a span[class="_link-text_1808vy"]');
        if (sizeElement) {
          companySize = sizeElement.textContent.trim() || "Size not found";
        }
        
        // Parse company location
        let companyLocation = "Location not found";
        const locationElement = document.querySelector('div[data-anonymize="location"]');
        if (locationElement) {
          companyLocation = locationElement.textContent.trim() || "Location not found";
        }
        
        // Parse company industry
        let companyIndustry = "Industry not found";
        const industryElement = document.querySelector('span[data-anonymize="industry"]');
        if (industryElement) {
          companyIndustry = industryElement.textContent.trim() || "Industry not found";
        }
        
        // If we found at least the company name, consider it successful
        if (companyName && companyName !== "Company name not found") {
          resolve({ 
            companyName, 
            companyLocation,
            companyIndustry,
            companyWebsite, 
            companySize 
          });
        } else if (attempts < maxAttempts) {
          setTimeout(checkForCompanyDetails, 500); // Repeat after 500ms
        } else {
          resolve({ 
            companyName: "Company name not found", 
            companyLocation: "Location not found",
            companyIndustry: "Industry not found",
            companyWebsite: "Website not found", 
            companySize: "Size not found" 
          });
        }
      };
      
      checkForCompanyDetails();
    });
  }

  // Lead profile parsing function (injected)
  function parseProfile() {
    return new Promise((resolve) => {
      // Wait for name to load with several attempts
      let attempts = 0;
      const maxAttempts = 10;
      
      const checkForData = () => {
        attempts++;
        
        // Parse full name
        const fullNameElement = document.querySelector('h1[data-anonymize="person-name"]');
        let fullName = fullNameElement ? fullNameElement.textContent.trim() : null;
        
        if (!fullName || fullName === "" || fullName === "LinkedIn Member") {
          // Try alternative selectors for name
          const alternativeSelectors = [
            'h1.text-heading-xlarge',
            'h1.break-words',
            '[data-test-id="profile-headline"] h1',
            '.pv-text-details__left-panel h1'
          ];
          
          for (const selector of alternativeSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent.trim()) {
              fullName = element.textContent.trim();
              break;
            }
          }
        }
        
        // Parse current roles
        const rolesData = [];
        const currentRoleContainer = document.querySelector('div[data-sn-view-name="lead-current-role"]');
        
        if (currentRoleContainer) {
          // Check if there are multiple roles in a list
          const rolesList = currentRoleContainer.querySelector('ul');
          
          if (rolesList) {
            // Multiple roles - each in li element
            const roleItems = rolesList.querySelectorAll('li');
            roleItems.forEach((roleItem) => {
              const jobTitle = roleItem.querySelector('span[data-anonymize="job-title"]')?.textContent?.trim() || "Role not found";
              const companyLink = roleItem.querySelector('a[data-anonymize="company-name"]');
              const companyHref = companyLink ? companyLink.getAttribute('href') : null;
              
              rolesData.push({
                jobTitle,
                companyHref
              });
            });
          } else {
            // Single role - directly in the container
            const jobTitle = currentRoleContainer.querySelector('span[data-anonymize="job-title"]')?.textContent?.trim() || "Role not found";
            const companyLink = currentRoleContainer.querySelector('a[data-anonymize="company-name"]');
            const companyHref = companyLink ? companyLink.getAttribute('href') : null;
            
            rolesData.push({
              jobTitle,
              companyHref
            });
          }
        }
        
        // If we found at least the name or roles, consider it successful
        if ((fullName && fullName !== "Profile name not found") || rolesData.length > 0) {
          resolve({ 
            fullName: fullName || "Profile name not found",
            roles: rolesData.length > 0 ? rolesData : [{ jobTitle: "No current role", companyHref: null }]
          });
        } else if (attempts < maxAttempts) {
          setTimeout(checkForData, 500); // Repeat after 500ms
        } else {
          resolve({ 
            fullName: "Profile name not found",
            roles: [{ jobTitle: "No current role", companyHref: null }]
          });
        }
      };
      
      checkForData();
    });
  }

  return (
    <div className="p-2 space-y-3">
      <h1 className="text-medium text-sm flex gap-2 items-center justify-center">
        <span className="h-1 w-1 rounded-full bg-black"></span>
        <span>
          Scrap data from{" "}
          <a
            href="https://www.linkedin.com/sales/search/people"
            target="_blank"
            className="text-purple-400 underline font-medium"
          >
            Search List
          </a>{" "}
        </span>
      </h1>
      <div className="flex flex-col text-center">
        {!isScrapingActive ? (
          <button
            onClick={fetchSearchData}
            className="py-2 px-4 bg-purple-600 rounded-lg cursor-pointer text-white"
          >
            Scrap This Table
          </button>
        ) : (
          <button
            onClick={stopScraping}
            className="py-2 px-4 bg-red-600 rounded-lg cursor-pointer text-white"
          >
            Stop Scraping
          </button>
        )}
        
        {scrapingProgress && (
          <div className="mt-2 p-2 bg-gray-100 rounded text-sm text-gray-700">
            {scrapingProgress}
          </div>
        )}
        
        <button
          onClick={unperseSearchData}
          className="py-2 px-4 bg-purple-600 rounded-lg cursor-pointer text-white mt-3"
          disabled={isScrapingActive}
        >
          Convert to CSV
        </button>
        <button
          onClick={clearSearchData}
          className="py-2 px-4 bg-red-600 rounded-lg cursor-pointer text-white mt-3"
          disabled={isScrapingActive}
        >
          Clear Data
        </button>
        <p className="my-2 text-gray-700">Search List Total Rows: {tableSearchSheetCount}</p>

        {csvData && (
          <div className="flex flex-col gap-2">
            <button
              onClick={downloadSearchCsv}
              className="py-2 px-4 bg-green-600 rounded-lg cursor-pointer text-white"
              disabled={isScrapingActive}
            >
              Download CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default SearchList;
