/* eslint-disable no-undef */
import { useState, useEffect } from "react";
import Papa from "papaparse";
const LeadList = () => {
  const [csvData, setCsvData] = useState("");
  const [tableSheetCount, setTableSheetCount] = useState(0);

  useEffect(() => {
    chrome.storage.local.get(["scrapedData"], (result) => {
      if (result.scrapedData && Array.isArray(result.scrapedData)) {
        setTableSheetCount(result.scrapedData.length - 1); // Exclude header row if present
      }
    });
  }, []);
  
  const fetchLeadData = async () => {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });

      const response = await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: () => {
          const tableElement = document.querySelector("table");
          if (tableElement) {
            return {
              tableHTML: tableElement.outerHTML,
            };
          }
          return { tableHTML: "No table found" };
        },
      });

      const data = response[0].result;

      if (data.tableHTML !== "No table found") {
        convertTableToCsv(data.tableHTML);
      }
    } catch (error) {
      console.error("Error fetching data", error);
    }
  };

  const convertTableToCsv = async (tableHTML) => {
    try {
      const tempDiv = document.createElement("div");
      tempDiv.innerHTML = tableHTML;

      const table = tempDiv.querySelector("table");
      const headers = Array.from(table.querySelectorAll("thead th"));
      const rows = Array.from(table.querySelectorAll("tbody tr"));

      const headerArray = [
        "FullName",
        "JobTitle",
        "Company",
        "Country"
      ];
      // Extract rows
      const dataArray = rows.map((row) => {
        const cells = Array.from(row.querySelectorAll("td"));

        const nameCell = cells[0]?.querySelector("a span");
        const name = nameCell ? nameCell.textContent.trim() : "Name not found";

        const designationCell = cells[0]?.querySelector(
          "div[data-anonymize='job-title']"
        );
        const designation = designationCell
          ? designationCell.textContent.trim()
          : "Job title not found";

        const rowData = cells.map((cell, index) => {
          // Replace dynamic columns with extracted data
          if (index === 0) return name;
          return cell.textContent.trim();
        });

        rowData.splice(1, 0, designation);

        const rowDataFiltered = rowData.slice(0, 4);
        return rowDataFiltered;
      });

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

      setTableSheetCount(combinedData.length - 1);
    } catch (error) {
      console.error("Error converting table to CSV", error);
    }
  };

  const unperseData = async () => {
    const data = await new Promise((resolve) => {
      chrome.storage.local.get(["scrapedData"], (result) => {
        resolve(result.scrapedData || []);
      });
    });

    if (data.length > 0) {
      const csv = Papa.unparse(data, {
        encoding: "utf-8"
    });
      setCsvData(csv);
    } else {
      console.error("No data available to convert to CSV");
    }
  };

  const downloadCsv = () => {
    if (!csvData) {
      console.error("No CSV data available for download");
      return;
    }

    const blob = new Blob([csvData], { 
      type: "text/csv", 
      encoding: "utf-8" 
    });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "linkedin_data.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    clearData();
  };

  const clearData = () => {
    chrome.storage.local.remove("scrapedData", () => {
      setCsvData("");
      setTableSheetCount(0);
    });
  };

  return (
    <div className="p-2 space-y-3">
      <h1 className="text-medium text-sm flex gap-2 items-center justify-center">
        <span>
          Scrap data from{" "}
          <a
            href="https://www.linkedin.com/sales/lists/people"
            target="_blank"
            className="text-purple-400 underline font-medium"
          >
            Lead List
          </a>{" "}
          & select your list
        </span>
      </h1>
      <div className="flex flex-col text-center">
        <button
          onClick={fetchLeadData}
          className="py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-white"
        >
          Scrap This Table
        </button>
        <button
          onClick={unperseData}
          className="py-2 px-4 bg-purple-600 hover:bg-purple-700 rounded-lg cursor-pointer text-white mt-3"
        >
          Convert to CSV
        </button>
        <button
          onClick={clearData}
          className="py-2 px-4 bg-red-600 hover:bg-red-700 rounded-lg cursor-pointer text-white mt-3"
        >
          Clear Data
        </button>
        <p className="my-2 text-gray-700">Total Rows: {tableSheetCount}</p>

        {csvData && (
          <div className="flex flex-col gap-2">
            <button
              onClick={downloadCsv}
              className="py-2 px-4 bg-green-600 hover:bg-green-700 rounded-lg cursor-pointer text-white"
            >
              Download CSV
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default LeadList;
