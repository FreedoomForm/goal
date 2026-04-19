import zipfile
import xml.etree.ElementTree as ET
import sys

def read_xlsx(file_path):
    try:
        with zipfile.ZipFile(file_path, 'r') as zf:
            # Get shared strings
            shared_strings = []
            if 'xl/sharedStrings.xml' in zf.namelist():
                xml_content = zf.read('xl/sharedStrings.xml')
                root = ET.fromstring(xml_content)
                ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                for t in root.findall('.//main:t', ns):
                    shared_strings.append(t.text if t.text else '')

            # Parse Sheet 1
            if 'xl/worksheets/sheet1.xml' in zf.namelist():
                sheet_xml = zf.read('xl/worksheets/sheet1.xml')
                root = ET.fromstring(sheet_xml)
                ns = {'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
                
                rows = []
                for row in root.findall('.//main:row', ns):
                    row_data = []
                    for c in row.findall('.//main:c', ns):
                        v = c.find('main:v', ns)
                        if v is not None:
                            val = v.text
                            # If it's a shared string (t="s")
                            if c.attrib.get('t') == 's':
                                val = shared_strings[int(val)]
                            row_data.append(val)
                        else:
                            row_data.append("")
                    rows.append(" | ".join(map(str, row_data)))
                return "\n".join(rows)
            else:
                return "Sheet1 not found"
    except Exception as e:
        return f"Error: {e}"

if __name__ == '__main__':
    print(read_xlsx(r'C:\Users\User\Downloads\aegisops_src\aegisops_src\Газовые_компании_Ташкента_ОС_и_ПО (1).xlsx'))
