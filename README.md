This project is orginally created in [qtecsolution/Linkedin-Sales-Navigator-Scraper](https://github.com/qtecsolution/Linkedin-Sales-Navigator-Scraper) and I've modified it to my use case. Please check the orginal project for more information and support.

### Version: 1.4.0
### @tag Go to next page automatically

# Linkedin Sales Navigator Data Scraper Chrome Extension

This project is a Chrome extension designed to scrape data from LinkedIn's Sales Navigator. It extracts relevant information such as names, profile URLs, industries, employee counts, and more, and allows users to download the data in CSV format. The extension is built using React and leverages Chrome's scripting and storage APIs for data extraction and management.

## Features

- **Scrape Account Data**: Extract detailed information from LinkedIn's Sales Navigator Account pages, including names, profile URLs, industries, employee counts, and more.
- **Scrape Lead List Data**: Extract data from LinkedIn's Sales Navigator Lead List pages, including names, profile URLs, designations, and outreach activities.
- **CSV Export**: Convert scraped data into CSV format for easy analysis and storage.
- **Chrome Storage Integration**: Save scraped data locally within the Chrome browser for later retrieval.
- **User-Friendly Interface**: Simple and intuitive UI for easy navigation and operation.

## Installation Guide

1. **Download the Project**:

   - Download the project as a `.zip` file from the repository.
   - Unzip the folder to a location on your computer.

2. **Load the Extension in Chrome**:
   - Open Chrome and go to `chrome://extensions/`.
   - Enable **Developer mode** in the top-right corner.
   - Click **Load unpacked** and select the `dist` folder from the unzipped project.
   - The extension is now ready to use!

---

## Notes

- Ensure you comply with LinkedIn's [Terms of Service](https://www.linkedin.com/legal/user-agreement) when using this extension.
- This extension is intended for educational and ethical use only.

## Changelog

### v1.3.1

- To ensure that the names are exported in universal format, encoding utf-8 has added as attribute in the unparse and export csv processes

### v1.3.0

- Total Rows will be count and show on extension populate
- Hover effect added to buttons

### v1.2.0

- Customized the output to my need
- Removed the account scrap tab
- Added Search List scrap tab
- Changed the extension name from "Linkedin Sales Navigator Scraper" into "Sales Navigator Demon"
- Changed the styling and icon
