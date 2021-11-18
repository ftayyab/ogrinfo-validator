
ogrinfo-validator wraps the `ogrinfo` GDAL tool to retrieve information about provided vector datasets. This package also allows the user to validate their vector data source against set criteria. Validation includes:
- Ability to determine if number of features is beyond specified limit
- If extent of the Vector Dataset is Incorrect

## Installation

1. [Install GDAL tools][1] (includes the `ogr2ogr` command line tool)

2. Install package:

```sh
npm install ogrinfo-validator
```

## Usage

ogrinfo takes a file path. The result will include general & validation information.

```javascript
// Using CommonJS modules
const ogrinfov = require('ogrinfo-validator')

// Simple Call
ogrinfov('test.shp');

// Call with options
ogrinfov('test.shp', {options: ['summaryOnly','listAll']});

// Call with options & Limits
ogrinfov('test.shp', {options: ['summaryOnly','listAll']}, {limits:{ featureCount: 10000, checkExtent: true }})

## IMPORTANT
- Input file (*.shp) must have related *.shx file and optional *.prj file.


## VERSION

-  1.0.3

## API

### ogrinfo-validator(input, options?) -> {metadata and validation information}

The **`input`** may be one of:

- A path (`string`). This includes file paths and network paths including HTTP endpoints.

The following **`options`** are available (none required):

- `summaryOnly` - Outputs summary only (default)
- `listAll` - Detailed Information/Metadata

The following **`limits`** are available for validation purposes (none required):

- `featureCount` - Reports if features are more then specified limit.
- `checkExtent` - Check extent (WGS84 Supported Only)

The **`output`** object has the following properties:

- `object` - Javascript object that contains metadata and validation Information. Error information is return in error key.
- 'Rejection Promise' - on Error
