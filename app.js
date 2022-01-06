/**
 * ogrinfo-validator
 *
 * @ignore
 * @license [MIT]{@link https://github.com/ftayyab/ogrinfo-validator}
 * @copyright (c) 2021-2022 FAIZAN TAYYAB, contributors.
 */
const path = require('path');
const fs = require('fs');
const { promisify, isNull, isNullOrUndefined, isObject }= require('util');
const { execFile, exec } = require('child_process');
const { readFile, existsSync } = require('fs');
const AdmZip = require("adm-zip");
const csv = require("@fast-csv/parse");

// Future Option
//const lookUpTable = {'summaryOnly':'-so', 'readOnly': '-ro', 'listAll': '-al'};
const lookUpTable = {'summaryOnly':'-so', 'listAll': '-al'};

const execFileAsync = promisify(execFile);
const readFileAsync = promisify(readFile);

const isRequired = () => { throw new Error('Parameter is required'); };

const VALID_GEOMETRY_TYPES = ["Point", "MultiPoint", "LineString", "MultiLineString", "Polygon", "MultiPolygon", "GeometryCollection"]

const checkFile = async (file)=>{
    if (file === null || file === undefined || file.length === 0){
        throw new Error('Failed: Input file not specified');
    }

    if (!existsSync(path.resolve(file))){
        throw new Error('Failed: Input file doesnt exists');
    }

    // shx file check for shp file
    if (file.split('.')[1] === 'shp'){
        if (!existsSync(path.resolve(file.split('.').slice(0, -1).join('.')+'.shx'))){
            throw new Error('Failed: .shx file missing');
        }
    }
}

/* Check Options */

const checkOptions = (options)=>{
    invalid = false;
    try{
        // check for the options added to the function call
        // if options is not an object
        if (options !== undefined && typeof(options) !== 'object'){
            invalid = true;
        }

        // if options is object but not an array
        if (options != undefined && typeof(options) === 'object'){
            if (Array.isArray(options)){
                invalid = true;
            }
        }

        if (options && invalid === false){
            
            let keys = Object.keys(options);

            if (keys.length == 0 || keys[0] != 'options'){
                invalid = true;
            }

            if (!Array.isArray(options[keys[0]])){
                invalid = true;
            }
            
            if(!invalid){
                options[keys[0]].forEach((key) =>{
                    if (key in lookUpTable === false){
                        invalid = true;
                    }
                });
            }
        }
        
        if(invalid){
            throw new Error('Failed: Incorrect Parameter Type "options".');
        }
    }
    catch(err){
        throw err;
    }
    finally{
        invalid = false;
    }
}

/* Check Limits */
const checkLimits = (limits)=>{
    invalid = false;
    
    try{
        if (limits != undefined && typeof(limits) !== 'object'){
            invalid = true;
        }

        if (limits != undefined && Array.isArray(limits)){
            invalid = true;
        }
        
        if (typeof(limits['limits']) === 'object' && Array.isArray(limits['limits'])){
            invalid = true;
        }

        if (limits && Object.keys(limits).length > 0 && invalid === false){
            let keys = Object.keys(limits);
            if (keys.length == 0 || keys[0] != 'limits'){
                invalid = true;
            }
        }
        
        if(invalid){
            throw new Error('Failed: Incorrect Parameter Type "limits"');
        }
    }
    catch(err){
        throw err;
    }
    finally{
        invalid = false;
    }
}

/* Validation based on GEOJSON Spec */
const validateGEOJSON = (payload) => {
    try
    {
        let BreakException = {"message": "Failed: Invalid GeoJSON"};
        
        // dealing with collection
        if (payload.type.toLowerCase() === 'featurecollection'){

            // Check that features is an array type
            if (!Array.isArray(payload.features)){
                throw BreakException
            }
            else
            {
                // Check that the feature collection does not contain coordindates or geometries
                if (payload.coordinates != undefined || payload.geometries != undefined || payload.geometry != undefined || payload.properties != undefined){
                    throw BreakException
                } 

                // Check features do not contain coordinates or geometries
                if (payload.features.coordinates != undefined || payload.features.geometries != undefined){
                      throw BreakException  
                }

                payload.features.forEach(feat => {
                    
                    let keys = Object.keys(feat);

                    if (keys.includes('geometry') && keys.includes('type') && keys.includes('properties')){
                        // Check for valid geometries
                        if (VALID_GEOMETRY_TYPES.includes(feat.geometry.type)){
                            // Check each feature geometry doesnt contain any wrong members
                            if (feat.geometry.geometry != undefined || feat.geometry.properties != undefined){
                                throw BreakException
                            }
                        }
                        else
                        {
                            // Invalid Type
                            throw BreakException
                        }
                    }
                    else
                    {
                        // Keys Missing
                        throw BreakException
                    }
                });
            }
            
            
            
        }
        // dealing with single Feature
        if (payload.type === 'Feature'){
            let keys = Object.keys(payload);
            if (keys.includes('geometry') && keys.includes('type') && keys.includes('properties')){
                if (!VALID_GEOMETRY_TYPES.includes(payload.geometry.type))
                {
                    throw BreakException
                }
            }
            else
            {
                // If required keys are missing
                throw BreakException
            }

            
        }
    }
    catch(err)
    {   
       return err;
    }
}

/* Validation GeoCSV File */
function validateGeoCSVFile(file) {
    return new Promise((resolve, reject) => {

        fs.createReadStream(path.resolve(file))
        .pipe(csv.parse({ headers: headers => headers.map(h => h.toLowerCase())}))
        .validate((row)=> {
            if(parseInt(row['latitude'])<-90 || parseInt(row['latitude'])>90){
                return false;
            }
            if(parseInt(row['longitude'])<-180 || parseInt(row['longitude'])>180){
                return false;
            }
            return true;
        })
        .on('headers', (header) => {
            let req_cols = [];
            for(let i=0; i<header.length; i++){
                // confirm positional columns exist and they are named as latitude or longitude
                if (header[i].toLowerCase() === 'latitude' || header[i].toLowerCase() === 'longitude'){
                    req_cols.push(header[i]);
                }
            }
            if (req_cols.length != 2){
                reject('Failed: Missing Lat/Lng columns')
            }
        })
        .on('error', error => reject(error))
        .on('data', (row)=>{
            // required for end to work properly
        })
        .on('data-invalid', (row, rowNumber) => {
            reject('Failed: Invalid Lat/Lng Values');
        })
        .on('end', rowCount => resolve(rowCount));
    });
}

const ogrinfov = async (file = isRequired(), options, limits) =>{
    try
    {
        /* Check that ogrinfo is available */
        let {stdout, stderr} = await execFileAsync('ogrinfo', ['--version']);

        if (stderr){
            throw new Error('Failed: Check GDAL is installed');
        }

        // If verson output is provided by GDAL
        
        if(stdout){
            // check File
            checkFile(file);

            let _options = [];

            // deal with geojson
            if(file.split(".")[1] === 'geojson' || file.split(".")[1] === 'json'){
                let payload = undefined;
                try {
                    payload = JSON.parse(await readFileAsync(path.resolve(file)));
                } catch(e) {
                    throw new Error('Failed: Invalid GeoJSON');
                }
                let err = validateGEOJSON(payload);
                if (err != undefined){
                    
                    if (err.message)
                    {
                        throw new Error("Failed: " + err.message);
                    }
                    else
                    {
                        throw new Error(err);
                    }
                }
            }


            // handling csv file
            if (file.split('.')[1] === 'csv'){
                
                try{
                    const result = parseInt(await validateGeoCSVFile(file));
                    //console.log(result);
                    // skip the result
                }
                catch(err){
                    throw new Error(err);
                }
            }

            
            // deal with Zip File
            if (file.split('.')[1] === 'zip'){

                // Determine required files are present

                let zip = new AdmZip(file);
                let zipEntries = zip.getEntries();
                
                required_files = [];

                zipEntries.forEach(async (entry)=>{
                    if (path.extname(entry.name) == '.shp' || path.extname(entry.name) == '.shx'){
                        required_files.push(entry.name); 
                    }
                });

                if (required_files.length === 2)
                {
                    // Reading a zip file
                    let zipfile_path = '/vsizip/'+path.resolve(file);
                    _options.push(zipfile_path);
                }
                else
                {
                    throw new Error('Failed: Missing shx file');
                }
                
            }
            else
            {
                _options.push(path.resolve(file));
            }
            
            // Check file path
            //console.log(_options);
            
            // options are optional checking for valid types
            if (options)
            {
                checkOptions(options);
            }
            

            // check limits if they are valid
            if(limits)
            {
                checkLimits(limits);
            }
            

            // Populate options for command line
            if (options){
                options['options'].forEach(o => {
                    _options.push(lookUpTable[o]);
                }); 
            }

            let metaData = {}
            
            if (_options.length <= 1){
                
                let results = await execFileAsync('ogrinfo', _options);

                if (results.stderr){
                    throw new Error('Failed: Command Failed');
                }
                
                metaData.info = results.stdout.substring(results.stdout.indexOf("using"), results.stdout.length).replace(/[\n\r1]/g, '').trim();
            }
            else
            {
                

                // ogrinfo -al test.csv -oo X_POSSIBLE_NAMES=Lon* -oo Y_POSSIBLE_NAMES=Lat* -oo KEEP_GEOM_COLUMNS=NO

                if (file.split('.')[1] === 'csv'){
                    _options.push('-oo')
                    _options.push('X_POSSIBLE_NAMES=longitude')
                    _options.push('-oo')
                    _options.push('Y_POSSIBLE_NAMES=latitude')
                    _options.push('-oo')
                    _options.push('KEEP_GEOM_COLUMNS=NO')
                }

                
                let results = await execFileAsync('ogrinfo', _options);

                if (results.stderr){
                    throw new Error('Failed: Command Failed');
                }
                
                if (_options.includes('-al')){
                    
                    if (file.split('.')[1] === 'csv'){
                        let srs = '(unknown)';
                        let match_result = results.stdout.substring(results.stdout.indexOf("Layer SRS WKT:") + "Layer SRS WKT:".length, results.stdout.length).trim();
                        //console.log(match_result);
                        metaData.layerName  = (/Layer name: .*/i.exec(results.stdout) === null || /Layer name: .*/i.exec(results.stdout) === undefined)? null : /Layer name: .*/i.exec(results.stdout)[0].split(':')[1].trim()
                        metaData.geometry = (/Geometry: .*/i.exec(results.stdout) === null || /Geometry: .*/i.exec(results.stdout) === undefined)? null : /Geometry: .*/i.exec(results.stdout)[0].split(':')[1].trim()
                        metaData.extent = (/Extent:.*/i.exec(results.stdout) === null || /Extent:.*/i.exec(results.stdout) === undefined)? null : /Extent:.*/i.exec(results.stdout)[0].split(':')[1].trim()
                        metaData.srs = srs;

                        
                        let idx = match_result.indexOf(srs);
                        
                        metaData.attr = match_result.substring(idx + parseInt(srs.length), match_result.length);
                    }
                    else
                    {
                        let match_result = results.stdout.substring(results.stdout.indexOf("Layer SRS WKT:") + "Layer SRS WKT:".length, results.stdout.length).trim();
                
                        metaData.layerName  = (/Layer name: .*/i.exec(results.stdout) === null || /Layer name: .*/i.exec(results.stdout) === undefined)? null : /Layer name: .*/i.exec(results.stdout)[0].split(':')[1].trim()
                        metaData.geometry = (/Geometry: .*/i.exec(results.stdout) === null || /Geometry: .*/i.exec(results.stdout) === undefined)? null : /Geometry: .*/i.exec(results.stdout)[0].split(':')[1].trim()
                        metaData.extent = (/Extent:.*/i.exec(results.stdout) === null || /Extent:.*/i.exec(results.stdout) === undefined)? null : /Extent:.*/i.exec(results.stdout)[0].split(':')[1].trim()

                        let patt = /\[|\]/g;

                        let last_index = -1

                        while (match = patt.exec(match_result)) {
                            last_index = match.index
                        }

                        if (last_index != -1){
                            metaData.srs = match_result.substring(0,last_index +1)
                            metaData.attr = match_result.substring(last_index + 1,match_result.length);
                        }
                        else
                        {
                            metaData.srs = match_result
                        }
                        
                        // Future Support for all Projections
                        if (match_result.indexOf("PROJECTION") > 0){
                            throw new Error('Failed: Projection not Supported');
                        }
                    }
                    // implement limits Logic
                    if (limits){
                        limits = limits.limits;
                        let keys = Object.keys(limits);
                        if (keys.length == 0){
                            throw new Error('Failed: Limit Parameters are missing');
                        }

                        limitsError = []

                        keys.forEach((key)=>{
                            if (key === 'featureCount'){
                                let featureCount = parseInt(/Feature Count: \d*/i.exec(results.stdout) === null || /Feature Count: \d*/i.exec(results.stdout) === undefined)? null : /Feature Count: \d*/i.exec(results.stdout)[0].split(':')[1].trim()
                                if (featureCount != null){
                                    if (parseInt(featureCount) >= parseInt(limits.featureCount)){
                                        metaData.featureCount = parseInt(featureCount);
                                        limitsError.push("Exceeds Limit of " + limits.featureCount + " features")
                                    }
                                    else
                                    {
                                        metaData.featureCount = parseInt(featureCount);
                                    }
                                }
                            }
                            if (key === 'checkExtent'){
                                if (limits.checkExtent){
                                    let coordinates = metaData.extent.split(' - ');
                                    top_left = coordinates[0].split(',');
                                    bottom_right = coordinates[1].split(',')
                                    
                                    let invalidExtent = false;
    
                                    if (parseFloat(/-?\d+.\d+/i.exec(top_left[0])) < -180){
                                        invalidExtent = true;
                                    }
                                    if (parseFloat(/-?\d+.\d+/i.exec(top_left[1])) > 90){
                                        invalidExtent = true;
                                    }
                                    if (parseFloat(/-?\d+.\d+/i.exec(bottom_right[0])) > 180){
                                        invalidExtent = true;
                                    }
                                    if (parseFloat(/-?\d+.\d+/i.exec(bottom_right[1])) < -90){
                                        invalidExtent = true;
                                    }
    
                                    if (invalidExtent){
                                        //metaData.extentError = "Invalid Vector Shape";
                                        limitsError.push("Invalid Vector Shape")
                                    }
                                }
                            }
                        });

                        if (limitsError.length > 0){
                            metaData.errors = limitsError;
                        }
                    }
                    
                }
                else
                {
                    metaData.info = results.stdout.substring(results.stdout.indexOf("using"), results.stdout.length).replace(/[\n\r1]/g, '').trim();
                }
            }   
            //console.log(metaData);
            return metaData;
        }
        else
        {
            throw new Error('Failed: Problem with GDAL, check installation');
        }
    }
    catch(err)
    {
        // Catch All Errors
        //console.log(err);
        if(err.message){
           return err.message;
        }
        else
        {
            return err;
        }
        
    }

}

module.exports = ogrinfov;

// Simple Call
/*let result = ogrinfov('countries_invalid.geojson');
result.then((r)=>{
    console.log(r);
}).catch((err)=>{
    console.log('Error: ' + err);
})*/
//ogrinfov('lon.csv', {options: ['summaryOnly','listAll']} ,{limits:{ featureCount: 1000, checkExtent: true }});

// Call with options
//ogrinfov('data_small.geojson', {options: ['summaryOnly','listAll']});
//ogrinfov('countries.geojson', {options: ['summaryOnly','listAll']});
//ogrinfov('countries.geojson', {options: ['summaryOnly','listAll']}, {limits:{ featureCount: 1000, checkExtent: true }})

// Call with options & Limits
//ogrinfov('weather2015.zip', {options: ['summaryOnly','listAll']}, {limits:{ featureCount: 1000, checkExtent: false }})
//ogrinfov('weather2015.zip', {options: ['summaryOnly','listAll']})
//module.exports = ogrinfov



