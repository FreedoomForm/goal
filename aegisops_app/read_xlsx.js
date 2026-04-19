const fs = require('fs');
const zlib = require('zlib');
const path = require('path');

const filePath = String.raw`C:\Users\User\Downloads\aegisops_src\aegisops_src\Газовые_компании_Ташкента_ОС_и_ПО (1).xlsx`;

// Fallback logic to read strings directly using regex or standard install
try {
  const xlsx = require('xlsx');
  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  console.log(xlsx.utils.sheet_to_csv(ws));
} catch (e) {
  console.error("Please run: npm install xlsx --no-save");
}
