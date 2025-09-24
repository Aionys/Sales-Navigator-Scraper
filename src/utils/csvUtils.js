import Papa from "papaparse";

export const unperseSearchData = async (setCsvData) => {
  const data = await new Promise((resolve) => {
    chrome.storage.local.get(["scrapedData"], (result) => {
      resolve(result.scrapedData || []);
    });
  });

  if (data.length > 0) {
    const csv = Papa.unparse(data, { quotes: true });
    setCsvData(csv);
  } else {
    console.error("No data available to convert to CSV");
  }
};

export const downloadSearchCsv = (csvData) => {
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

export const clearSearchData = (setCsvData, setTableSearchSheetCount) => {
  chrome.storage.local.remove("scrapedData", () => {
    setCsvData("");
    setTableSearchSheetCount(0);
  });
};