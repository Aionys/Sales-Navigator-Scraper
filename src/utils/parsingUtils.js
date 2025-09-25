export async function waitForTabLoad(tabId) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 15000);
  });
}

export function parseCompanyDetails() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 10;
    
    const checkForCompanyDetails = () => {
      attempts++;
      
      const companyNameElement = document.querySelector('div[data-anonymize="company-name"]');
      const companyName = companyNameElement ? companyNameElement.textContent.trim() : "Company name not found";
      
      let companyWebsite = "Website not found";
      const websiteElement = document.querySelector('a[data-control-name="visit_company_website"]');
      if (websiteElement) {
        companyWebsite = websiteElement.getAttribute('href') || "Website not found";
      }
      
      let companyLocation = "Location not found";
      const locationElement = document.querySelector('div[data-anonymize="location"]');
      if (locationElement) {
        companyLocation = locationElement.textContent.trim() || "Location not found";
      }
      
      let companyIndustry = "Industry not found";
      const industryElement = document.querySelector('span[data-anonymize="industry"]');
      if (industryElement) {
        companyIndustry = industryElement.textContent.trim() || "Industry not found";
      }
      
      if (companyName !== "Company name not found" || attempts >= maxAttempts) {
        resolve({ 
          companyName, 
          companyLocation,
          companyIndustry,
          companyWebsite
        });
      } else {
        setTimeout(checkForCompanyDetails, 500);
      }
    };
    
    checkForCompanyDetails();
  });
}

export function parseProfile() {
  return new Promise((resolve) => {
    let attempts = 0;
    const maxAttempts = 10;
    
    const checkForData = () => {
      attempts++;

      const firstNameElement = document.querySelector('h2 span[data-anonymize="person-name"]');
      let firstName = firstNameElement ? firstNameElement.textContent.trim() : null;
      
      const fullNameElement = document.querySelector('h1[data-anonymize="person-name"]');
      let fullName = fullNameElement ? fullNameElement.textContent.trim() : null;
      
      if (!fullName || fullName === "" || fullName === "LinkedIn Member") {
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
      
      const rolesData = [];
      const currentRoleContainer = document.querySelector('div[data-sn-view-name="lead-current-role"]');
      
      if (currentRoleContainer) {
        const rolesList = currentRoleContainer.querySelector('ul');
        
        if (rolesList) {
          const roleItems = rolesList.querySelectorAll('li');
          roleItems.forEach((roleItem) => {
            const jobTitle = roleItem.querySelector('span[data-anonymize="job-title"]')?.textContent?.trim() || "No current role";
            const companyLink = roleItem.querySelector('a[data-anonymize="company-name"]');
            const companyHref = companyLink ? companyLink.getAttribute('href') : null;
            
            rolesData.push({
              jobTitle,
              companyHref
            });
          });
        } else {
          const jobTitle = currentRoleContainer.querySelector('span[data-anonymize="job-title"]')?.textContent?.trim() || "No current role";
          const companyLink = currentRoleContainer.querySelector('a[data-anonymize="company-name"]');
          const companyHref = companyLink ? companyLink.getAttribute('href') : null;
          
          rolesData.push({
            jobTitle,
            companyHref
          });
        }
      }
      
      if ((fullName && fullName !== "Profile name not found") || rolesData.length > 0 || attempts >= maxAttempts) {
        resolve({
          firstName: firstName || "First name not found",
          fullName: fullName || "Profile name not found",
          roles: rolesData.length > 0 ? rolesData : [{ jobTitle: "No current role", companyHref: null }]
        });
      } else {
        setTimeout(checkForData, 500);
      }
    };
    
    checkForData();
  });
}

export const scrollTopToBottom = async () => {
  return new Promise((resolve) => {
    let totalHeight = 0;
    const distance = 200;
    const scrollDelay = 100;
    const container = document.getElementById("search-results-container");
    
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