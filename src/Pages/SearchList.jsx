/* eslint-disable no-undef */
import { useState, useRef, useEffect } from "react";
import { unperseSearchData, downloadSearchCsv, clearSearchData } from '../utils/csvUtils';
import { parseProfile, parseCompanyDetails, scrollTopToBottom, waitForTabLoad } from '../utils/parsingUtils';
import { headerArray, baseLinkedinUrl } from '../utils/constants';
import { cleanName } from "../utils/nameUtils"

const SearchList = () => {
  const [csvData, setCsvData] = useState("");
  const [tableSearchSheetCount, setTableSearchSheetCount] = useState(0);
  const [isScrapingActive, setIsScrapingActive] = useState(false);
  const [scrapingProgress, setScrapingProgress] = useState("");
  const scrapingRef = useRef(false);

  useEffect(() => {
    chrome.storage.local.get(["scrapedData"], (result) => {
      if (result.scrapedData && result.scrapedData.length > 0) {
        setTableSearchSheetCount(result.scrapedData.length - 1);
        setCsvData(Papa.unparse(result.scrapedData));
      }
    });
  }, []);

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
              setTimeout(() => {
                clearInterval(interval);
                resolve(false);
              }, 5000);
            });
          },
        });

        await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: scrollTopToBottom,
        });

        await new Promise(resolve => setTimeout(resolve, 2000));

        const response = await chrome.scripting.executeScript({
          target: { tabId: tab.id },
          func: () => {
            const tableElement = document.querySelector("ol.artdeco-list");
            if (tableElement) {
              return { tableHTML: tableElement.outerHTML };
            }
            return { tableHTML: "No table found" };
          },
        });

        const data = response[0].result;

        if (data.tableHTML !== "No table found" && scrapingRef.current) {
          await convertSearchTableToCsv(data.tableHTML, pageNumber, setTableSearchSheetCount, setScrapingProgress, scrapingRef);
        }

        if (!scrapingRef.current) {
          break;
        }

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
          await new Promise(resolve => setTimeout(resolve, 2000));
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

  const convertSearchTableToCsv = async (tableHTML, pageNumber, setTableSearchSheetCount, setScrapingProgress, scrapingRef) => {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = tableHTML;

      const table = tempDiv.querySelector("ol.artdeco-list");
      const rows = Array.from(table.querySelectorAll("li.artdeco-list__item"));

      console.log(`Found ${rows.length} leads on page ${pageNumber}`);
      setScrapingProgress(`Page ${pageNumber}: processing ${rows.length} leads...`);

      let totalProcessed = 0;
      
      for (let i = 0; i < rows.length; i++) {
        if (!scrapingRef.current) {
          console.log("Parsing stopped by user");
          break;
        }

        const row = rows[i];
        setScrapingProgress(`Page ${pageNumber}: processing lead ${i + 1}/${rows.length}...`);

        try {
          const countryCell = row?.querySelector('div span[data-anonymize="location"]');
          const leadLocation = countryCell ? countryCell.textContent.trim() : "Location not found";
          
          const profileHrefElement = row?.querySelector(".artdeco-entity-lockup__title a");
          const profileUrl = profileHrefElement ? buildUrl(profileHrefElement.getAttribute("href")) : null;

          let profileData = { 
            firstName: "First name not found",
            fullName: "Profile name not found", 
            roles: [{ jobTitle: "No current role", companyHref: null }] 
          };

          if (profileUrl && scrapingRef.current) {
            try {
              console.log(`Opening profile: ${profileUrl}`);
              const profileTab = await chrome.tabs.create({ url: profileUrl, active: false });
              await waitForTabLoad(profileTab.id);
              
              if (!scrapingRef.current) {
                await chrome.tabs.remove(profileTab.id);
                break;
              }

              await new Promise(resolve => setTimeout(resolve, 3000));

              const profileResponse = await chrome.scripting.executeScript({
                target: { tabId: profileTab.id },
                func: parseProfile,
              });

              profileData = profileResponse[0].result;
              console.log(`Parsed profile data:`, profileData);

              await chrome.tabs.remove(profileTab.id);
            } catch (error) {
              console.error("Error fetching profile data", error);
              profileData = { 
                firstName: "Error parsing first name",
                fullName: "Error parsing full name", 
                roles: [{ jobTitle: "Error parsing role", companyHref: null }] 
              };
            }
          }

          for (let roleIndex = 0; roleIndex < profileData.roles.length; roleIndex++) {
            if (!scrapingRef.current) {
              break;
            }

            const role = profileData.roles[roleIndex];
            let companyDetails = {
              companyName: "Company name not found",
              companyLocation: "Location not found",
              companyIndustry: "Industry not found",
              companyWebsite: "Website not found"
            };

            if (role.companyHref && scrapingRef.current) {
              try {
                const companyUrl = buildUrl(role.companyHref);
                console.log(`Opening company page: ${companyUrl}`);
                
                const companyTab = await chrome.tabs.create({ url: companyUrl, active: false });
                await waitForTabLoad(companyTab.id);
                
                if (!scrapingRef.current) {
                  await chrome.tabs.remove(companyTab.id);
                  break;
                }

                await new Promise(resolve => setTimeout(resolve, 4000));

                const companyResponse = await chrome.scripting.executeScript({
                  target: { tabId: companyTab.id },
                  func: parseCompanyDetails,
                });

                companyDetails = companyResponse[0].result;
                console.log(`Parsed company details:`, companyDetails);

                await chrome.tabs.remove(companyTab.id);
              } catch (error) {
                console.error("Error fetching company data", error);
                companyDetails = {
                  companyName: "Error parsing company",
                  companyLocation: "Error parsing location",
                  companyIndustry: "Error parsing industry",
                  companyWebsite: "Website not found"
                };
              }
            }

            if (companyDetails.companyName === "Company name not found") {
              console.log(`Skipping lead for ${profileData.firstName} ${profileData.fullName} - Company not found`);
              continue;
            }

            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));

            const { firstName, lastName } = cleanName(profileData.firstName, profileData.fullName);

            const rowData = [
              firstName,
              lastName,
              leadLocation,
              companyDetails.companyName,
              role.jobTitle,
              companyDetails.companyWebsite,
              companyDetails.companyIndustry,
              companyDetails.companyLocation,
            ];

            const previousData = await new Promise((resolve) => {
              chrome.storage.local.get(["scrapedData"], (result) => {
                resolve(result.scrapedData || []);
              });
            });

            let combinedData;
            if (previousData.length === 0) {
              combinedData = [headerArray, rowData];
            } else {
              const isHeaderIncluded = previousData[0].every((header, index) => header === headerArray[index]);
              combinedData = isHeaderIncluded 
                ? [...previousData, rowData]
                : [headerArray, ...previousData, rowData];
            }

            await chrome.storage.local.set({ scrapedData: combinedData });
            totalProcessed++;
            setTableSearchSheetCount(combinedData.length - 1);
            console.log(`Saved new record for ${profileData.fullName}. Total in database: ${combinedData.length - 1}`);
          }        
        } catch (error) {
          console.error(`Error processing lead:`, error);
          const errorRow = [
            "Error parsing first name",
            "Error parsing last name",
            "Error parsing lead location",
            "Error parsing company",
            "Error parsing title",
            "Error parsing website",
            "Error parsing industry",
            "Error parsing company location",
          ];

          const previousData = await new Promise((resolve) => {
            chrome.storage.local.get(["scrapedData"], (result) => {
              resolve(result.scrapedData || []);
            });
          });

          let combinedData;
          if (previousData.length === 0) {
            combinedData = [headerArray, errorRow];
          } else {
            const isHeaderIncluded = previousData[0].every((header, index) => header === headerArray[index]);
            combinedData = isHeaderIncluded 
              ? [...previousData, errorRow]
              : [headerArray, ...previousData, errorRow];
          }

          await chrome.storage.local.set({ scrapedData: combinedData });
          totalProcessed++;
          setTableSearchSheetCount(combinedData.length - 1);
          console.log(`Saved error record. Total in database: ${combinedData.length - 1}`);
        }
      }

      setScrapingProgress(`Page ${pageNumber} completed. Leads processed: ${totalProcessed}. Total: ${tableSearchSheetCount}`);
      
    } catch (error) {
      console.error("Error converting table to CSV", error);
      setScrapingProgress(`Error on page ${pageNumber}: ${error.message}`);
    }
  };

  const stopScraping = () => {
    scrapingRef.current = false;
    setIsScrapingActive(false);
    setScrapingProgress("Stopping parsing...");
  };

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
          onClick={() => unperseSearchData(setCsvData)}
          className="py-2 px-4 bg-purple-600 rounded-lg cursor-pointer text-white mt-3"
          disabled={isScrapingActive}
        >
          Convert to CSV
        </button>
        <button
          onClick={() => clearSearchData(setCsvData, setTableSearchSheetCount)}
          className="py-2 px-4 bg-red-600 rounded-lg cursor-pointer text-white mt-3"
          disabled={isScrapingActive}
        >
          Clear Data
        </button>
        <p className="my-2 text-gray-700">Search List Total Rows: {tableSearchSheetCount}</p>

        {csvData && (
          <div className="flex flex-col gap-2">
            <button
              onClick={() => downloadSearchCsv(csvData)}
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