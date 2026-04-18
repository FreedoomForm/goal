const fs = require('fs');
const xlsx = require('xlsx');
const filePath = String.raw`C:\Users\User\Downloads\aegisops_src\aegisops_src\Газовые_компании_Ташкента_ОС_и_ПО (1).xlsx`;
try {
  const wb = xlsx.readFile(filePath);
  const ws = wb.Sheets[wb.SheetNames[0]];
  const csv = xlsx.utils.sheet_to_csv(ws);
  fs.writeFileSync('parsed_utf8.csv', csv, 'utf8');
  console.log("Success");
} catch (e) {
  console.error(e);
}
