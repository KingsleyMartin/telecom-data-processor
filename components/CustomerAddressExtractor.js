"use client";

import React, { useState, useCallback, useMemo, useReducer } from 'react';
import Papa from 'papaparse';
import { Upload, Download, FileText, Users, MapPin, CheckCircle, AlertCircle, ChevronDown, ChevronRight } from 'lucide-react';

// Constants
const FILE_TYPES = {
  ORDER: 'order',
  COMMISSION: 'commission'
};

const ADDRESS_MODES = {
  SINGLE: 'single',
  COMPONENTS: 'components'
};

const STEPS = {
  UPLOAD: 1,
  COLUMN_SELECTION: 2,
  RESULTS: 3
};

// Initial state
const initialState = {
  files: { [FILE_TYPES.ORDER]: null, [FILE_TYPES.COMMISSION]: null },
  parsedData: { [FILE_TYPES.ORDER]: null, [FILE_TYPES.COMMISSION]: null },
  columnMappings: {
    [FILE_TYPES.ORDER]: { customer: '', addressMode: ADDRESS_MODES.COMPONENTS, singleAddress: '', address1: '', address2: '', city: '', state: '', zip: '' },
    [FILE_TYPES.COMMISSION]: { customer: '', addressMode: ADDRESS_MODES.COMPONENTS, singleAddress: '', address1: '', address2: '', city: '', state: '', zip: '' }
  },
  uniqueCustomers: [],
  processing: false,
  step: STEPS.UPLOAD
};

// Reducer for complex state management
function appReducer(state, action) {
  switch (action.type) {
    case 'SET_FILE':
      return {
        ...state,
        files: { ...state.files, [action.fileType]: action.file }
      };
    case 'SET_PARSED_DATA':
      return {
        ...state,
        parsedData: { ...state.parsedData, [action.fileType]: action.data }
      };
    case 'SET_COLUMN_MAPPING':
      return {
        ...state,
        columnMappings: {
          ...state.columnMappings,
          [action.fileType]: { ...state.columnMappings[action.fileType], [action.field]: action.value }
        }
      };
    case 'SET_ADDRESS_MODE':
      return {
        ...state,
        columnMappings: {
          ...state.columnMappings,
          [action.fileType]: { ...state.columnMappings[action.fileType], addressMode: action.mode }
        }
      };
    case 'SET_UNIQUE_CUSTOMERS':
      return { ...state, uniqueCustomers: action.customers };
    case 'SET_PROCESSING':
      return { ...state, processing: action.processing };
    case 'SET_STEP':
      return { ...state, step: action.step };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// Utility functions
const detectColumnType = (headers, patterns) => {
  return headers.find(header => 
    patterns.some(pattern => header.toLowerCase().includes(pattern))
  ) || '';
};

const autoDetectColumns = (headers) => {
  const customerCol = detectColumnType(headers, ['customer', 'client']);
  const singleAddressCol = headers.find(h => 
    h.toLowerCase() === 'address' ||
    h.toLowerCase() === 'full address' ||
    h.toLowerCase() === 'complete address' ||
    (h.toLowerCase().includes('address') && 
     !h.toLowerCase().includes('1') && 
     !h.toLowerCase().includes('2') && 
     !h.toLowerCase().includes('line'))
  ) || '';
  
  const address1Col = detectColumnType(headers, ['address 1', 'address1', 'line 1']);
  const address2Col = detectColumnType(headers, ['address 2', 'address2', 'line 2']);
  const cityCol = detectColumnType(headers, ['city']);
  const stateCol = detectColumnType(headers, ['state']);
  const zipCol = detectColumnType(headers, ['zip', 'postal']);

  const hasComponentFields = address1Col || cityCol || stateCol || zipCol;
  const addressMode = singleAddressCol && !hasComponentFields ? ADDRESS_MODES.SINGLE : ADDRESS_MODES.COMPONENTS;

  return {
    customer: customerCol,
    addressMode,
    singleAddress: singleAddressCol,
    address1: address1Col,
    address2: address2Col,
    city: cityCol,
    state: stateCol,
    zip: zipCol
  };
};

// Custom hooks
const useCSVParser = () => {
  return useCallback((file, onComplete) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: onComplete,
      error: (error) => {
        console.error('CSV parsing error:', error);
        alert('Error parsing CSV file. Please check the file format.');
      }
    });
  }, []);
};

const useCustomerExtractor = () => {
  return useCallback((parsedData, columnMappings) => {
    const extractFromFile = (data, mapping) => {
      if (!data || !mapping.customer) return [];
      
      return data.data.map(row => {
        const customer = row[mapping.customer]?.toString().trim() || '';
        if (!customer) return null;
        
        let address1 = '', address2 = '', city = '', state = '', zip = '';
        
        if (mapping.addressMode === ADDRESS_MODES.SINGLE && mapping.singleAddress) {
          address1 = row[mapping.singleAddress]?.toString().trim() || '';
        } else {
          address1 = mapping.address1 && row[mapping.address1] ? row[mapping.address1].toString().trim() : '';
          address2 = mapping.address2 && row[mapping.address2] ? row[mapping.address2].toString().trim() : '';
          city = mapping.city && row[mapping.city] ? row[mapping.city].toString().trim() : '';
          state = mapping.state && row[mapping.state] ? row[mapping.state].toString().trim() : '';
          zip = mapping.zip && row[mapping.zip] ? row[mapping.zip].toString().trim() : '';
        }
        
        const addressParts = [address1, address2, city, state, zip].filter(Boolean);
        const combinedAddress = addressParts.join(', ') || 'No address provided';
        
        return { customer, address1, address2, city, state, zip, combinedAddress, source: 'Unknown' };
      }).filter(Boolean);
    };

    const orderCustomers = extractFromFile(parsedData[FILE_TYPES.ORDER], columnMappings[FILE_TYPES.ORDER])
      .map(c => ({ ...c, source: 'Order File' }));
    
    const commissionCustomers = extractFromFile(parsedData[FILE_TYPES.COMMISSION], columnMappings[FILE_TYPES.COMMISSION])
      .map(c => ({ ...c, source: 'Commission File' }));

    const allCustomers = [...orderCustomers, ...commissionCustomers];
    const uniqueMap = new Map();
    
    allCustomers.forEach(customer => {
      const key = `${customer.customer.toLowerCase()}|${customer.combinedAddress.toLowerCase()}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, customer);
      } else {
        const existing = uniqueMap.get(key);
        if (!existing.source.includes(customer.source)) {
          existing.source = `${existing.source}, ${customer.source}`;
        }
      }
    });

    return Array.from(uniqueMap.values()).sort((a, b) => a.customer.localeCompare(b.customer));
  }, []);
};

// Step indicator component
const StepIndicator = React.memo(({ currentStep }) => (
  <div className="flex items-center justify-center mb-8">
    {[STEPS.UPLOAD, STEPS.COLUMN_SELECTION, STEPS.RESULTS].map((stepNum) => (
      <div key={stepNum} className="flex items-center">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
          currentStep >= stepNum ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'
        }`}>
          {currentStep > stepNum ? <CheckCircle size={16} /> : stepNum}
        </div>
        {stepNum < STEPS.RESULTS && (
          <div className={`w-16 h-1 ${currentStep > stepNum ? 'bg-blue-600' : 'bg-gray-200'}`} />
        )}
      </div>
    ))}
  </div>
));

// File upload component
const FileUploadStep = React.memo(({ files, onFileUpload, onContinue }) => (
  <div className="space-y-6">
    <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 1: Upload File Pair</h3>
    
    <div className="grid md:grid-cols-2 gap-6">
      {Object.values(FILE_TYPES).map((fileType) => (
        <div key={fileType} className="border-2 border-dashed border-gray-300 rounded-lg p-6">
          <div className="text-center">
            <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
            <h4 className="text-lg font-medium text-gray-900 mb-2 capitalize">
              {fileType} File
            </h4>
            <div className="mb-4">
              <input
                type="file"
                accept=".csv"
                onChange={(e) => onFileUpload(e, fileType)}
                className="hidden"
                id={`${fileType}-upload`}
              />
              <label
                htmlFor={`${fileType}-upload`}
                className="bg-blue-600 text-white px-4 py-2 rounded-md cursor-pointer hover:bg-blue-700 transition-colors"
              >
                Choose CSV File
              </label>
            </div>
            {files[fileType] && (
              <p className="text-sm text-green-600 flex items-center justify-center">
                <CheckCircle size={16} className="mr-1" />
                {files[fileType].name}
              </p>
            )}
          </div>
        </div>
      ))}
    </div>
    
    {files[FILE_TYPES.ORDER] && files[FILE_TYPES.COMMISSION] && (
      <div className="text-center">
        <button
          onClick={onContinue}
          className="bg-green-600 text-white px-6 py-2 rounded-md hover:bg-green-700 transition-colors"
        >
          Continue to Column Selection
        </button>
      </div>
    )}
  </div>
));

// Address preview component
const AddressPreview = React.memo(({ parsedData, columnMappings, fileType }) => {
  const preview = useMemo(() => {
    if (!parsedData[fileType] || !parsedData[fileType].data.length) return '';
    
    const mapping = columnMappings[fileType];
    const sampleRow = parsedData[fileType].data[0];
    
    if (mapping.addressMode === ADDRESS_MODES.SINGLE && mapping.singleAddress) {
      return sampleRow[mapping.singleAddress]?.toString().trim() || 'No address data';
    } else {
      const addressParts = [];
      ['address1', 'address2', 'city', 'state', 'zip'].forEach(field => {
        if (mapping[field] && sampleRow[mapping[field]]) {
          const value = sampleRow[mapping[field]].toString().trim();
          if (value) addressParts.push(value);
        }
      });
      return addressParts.join(', ') || 'No address components selected';
    }
  }, [parsedData, columnMappings, fileType]);

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
      <h5 className="text-sm font-medium text-blue-900 mb-2">Address Preview:</h5>
      <p className="text-sm text-blue-800 font-mono bg-white rounded px-2 py-1 border">
        {preview}
      </p>
      <p className="text-xs text-blue-600 mt-1">
        Mode: {columnMappings[fileType].addressMode === ADDRESS_MODES.SINGLE ? 'Single Field' : 'Multiple Components'}
      </p>
    </div>
  );
});

// Customer table row component
const CustomerTableRow = React.memo(({ customer, index }) => {
  const hasAddress = customer.address1?.trim() || customer.address2?.trim() || 
                    customer.city?.trim() || customer.state?.trim() || customer.zip?.trim();
  const isNoAddress = !hasAddress || customer.combinedAddress === 'No address provided';
  
  return (
    <tr className={`hover:bg-gray-50 ${isNoAddress ? 'bg-orange-50' : ''}`}>
      <td className="px-4 py-4 text-sm font-medium text-gray-900">{customer.customer}</td>
      <td className="px-4 py-4 text-sm text-gray-500">
        <span className={isNoAddress && !customer.address1 ? 'text-orange-600 italic' : ''}>
          {customer.address1 || (isNoAddress ? 'No address' : '')}
        </span>
      </td>
      <td className="px-4 py-4 text-sm text-gray-500">{customer.address2 || ''}</td>
      <td className="px-4 py-4 text-sm text-gray-500">{customer.city || ''}</td>
      <td className="px-4 py-4 text-sm text-gray-500">{customer.state || ''}</td>
      <td className="px-4 py-4 text-sm text-gray-500">{customer.zip || ''}</td>
      <td className="px-4 py-4 text-sm text-gray-500">{customer.source}</td>
    </tr>
  );
});

// Main component
const CustomerAddressExtractor = () => {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const [dataSummaryExpanded, setDataSummaryExpanded] = useState(false);
  const parseCSV = useCSVParser();
  const extractCustomers = useCustomerExtractor();

  const handleFileUpload = useCallback((event, fileType) => {
    const file = event.target.files[0];
    if (!file) return;

    dispatch({ type: 'SET_FILE', fileType, file });
    
    parseCSV(file, (result) => {
      const headers = Object.keys(result.data[0] || {});
      const detectedColumns = autoDetectColumns(headers);
      
      dispatch({ 
        type: 'SET_PARSED_DATA', 
        fileType, 
        data: { data: result.data, headers } 
      });
      
      // Set detected column mappings
      Object.entries(detectedColumns).forEach(([field, value]) => {
        if (field === 'addressMode') {
          dispatch({ type: 'SET_ADDRESS_MODE', fileType, mode: value });
        } else {
          dispatch({ type: 'SET_COLUMN_MAPPING', fileType, field, value });
        }
      });
    });
  }, [parseCSV]);

  const handleColumnChange = useCallback((fileType, field, value) => {
    dispatch({ type: 'SET_COLUMN_MAPPING', fileType, field, value });
  }, []);

  const handleAddressModeChange = useCallback((fileType, mode) => {
    dispatch({ type: 'SET_ADDRESS_MODE', fileType, mode });
  }, []);

  const processCustomers = useCallback(async () => {
    dispatch({ type: 'SET_PROCESSING', processing: true });
    
    // Use setTimeout to prevent blocking the UI
    setTimeout(() => {
      const customers = extractCustomers(state.parsedData, state.columnMappings);
      dispatch({ type: 'SET_UNIQUE_CUSTOMERS', customers });
      dispatch({ type: 'SET_PROCESSING', processing: false });
      dispatch({ type: 'SET_STEP', step: STEPS.RESULTS });
    }, 100);
  }, [state.parsedData, state.columnMappings, extractCustomers]);

  const removeNoAddressRecords = useCallback(() => {
    const filteredCustomers = state.uniqueCustomers.filter(customer => {
      const hasAddress = customer.address1?.trim() || customer.address2?.trim() || 
                        customer.city?.trim() || customer.state?.trim() || customer.zip?.trim();
      return hasAddress && customer.combinedAddress !== 'No address provided';
    });
    
    const removedCount = state.uniqueCustomers.length - filteredCustomers.length;
    dispatch({ type: 'SET_UNIQUE_CUSTOMERS', customers: filteredCustomers });
    
    if (removedCount > 0) {
      alert(`Removed ${removedCount} record(s) with no address information.`);
    } else {
      alert('No records found with missing address information.');
    }
  }, [state.uniqueCustomers]);

  const downloadCSV = useCallback(() => {
    const csv = Papa.unparse(state.uniqueCustomers.map(c => ({
      'Customer Name': c.customer,
      'Address 1': c.address1 || '',
      'Address 2': c.address2 || '',
      'City': c.city || '',
      'State': c.state || '',
      'Zip Code': c.zip || '',
      'Source': c.source
    })), {
      quotes: true, // Force quotes around all fields to prevent comma splitting
      quoteChar: '"',
      escapeChar: '"',
      delimiter: ','
    });
    
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', 'unique_customers_addresses.csv');
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }, [state.uniqueCustomers]);

  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Computed values
  const noAddressCount = useMemo(() => {
    return state.uniqueCustomers.filter(customer => {
      const hasAddress = customer.address1?.trim() || customer.address2?.trim() || 
                        customer.city?.trim() || customer.state?.trim() || customer.zip?.trim();
      return !hasAddress || customer.combinedAddress === 'No address provided';
    }).length;
  }, [state.uniqueCustomers]);

  const canProceedToPreview = useMemo(() => {
    const orderMapping = state.columnMappings[FILE_TYPES.ORDER];
    const commissionMapping = state.columnMappings[FILE_TYPES.COMMISSION];
    
    const hasOrderConfig = orderMapping.customer && 
      ((orderMapping.addressMode === ADDRESS_MODES.SINGLE && orderMapping.singleAddress) ||
       (orderMapping.addressMode === ADDRESS_MODES.COMPONENTS && (orderMapping.address1 || orderMapping.city)));
    
    const hasCommissionConfig = commissionMapping.customer && 
      ((commissionMapping.addressMode === ADDRESS_MODES.SINGLE && commissionMapping.singleAddress) ||
       (commissionMapping.addressMode === ADDRESS_MODES.COMPONENTS && (commissionMapping.address1 || commissionMapping.city)));
    
    return hasOrderConfig && hasCommissionConfig;
  }, [state.columnMappings]);

  // Render column selection step
  const renderColumnSelection = () => (
    <div className="space-y-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Step 2: Select Relevant Columns</h3>
      
      {Object.values(FILE_TYPES).map((fileType) => (
        <div key={fileType} className="bg-gray-50 rounded-lg p-6">
          <h4 className="font-medium text-gray-900 mb-4 capitalize flex items-center">
            <FileText className="mr-2" size={20} />
            {fileType} File - Column Mapping
          </h4>
          
          <div className="grid gap-4">
            {/* Customer Name Selection */}
            <div className="grid md:grid-cols-3 gap-4 items-center">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Customer Name <span className="text-red-500">*</span>
                </label>
                <select
                  value={state.columnMappings[fileType].customer}
                  onChange={(e) => handleColumnChange(fileType, 'customer', e.target.value)}
                  className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm ${
                    !state.columnMappings[fileType].customer ? 'bg-yellow-50' : 'bg-white'
                  }`}
                >
                  <option value="">Select column...</option>
                  {state.parsedData[fileType]?.headers.map((header) => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                {state.columnMappings[fileType].customer && state.parsedData[fileType]?.data.length > 0 && (
                  <div className="bg-white border border-gray-200 rounded p-2 text-sm">
                    <strong>Preview:</strong> {state.parsedData[fileType].data[0][state.columnMappings[fileType].customer] || 'No data'}
                  </div>
                )}
              </div>
            </div>

            {/* Address Mode Selection */}
            <div className="border-t pt-4">
              <h5 className="text-sm font-medium text-gray-800 mb-3">Address Configuration</h5>
              <div className="flex gap-4 mb-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name={`addressMode-${fileType}`}
                    value={ADDRESS_MODES.SINGLE}
                    checked={state.columnMappings[fileType].addressMode === ADDRESS_MODES.SINGLE}
                    onChange={() => handleAddressModeChange(fileType, ADDRESS_MODES.SINGLE)}
                    className="mr-2"
                  />
                  <span className="text-sm">Single Address Field</span>
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name={`addressMode-${fileType}`}
                    value={ADDRESS_MODES.COMPONENTS}
                    checked={state.columnMappings[fileType].addressMode === ADDRESS_MODES.COMPONENTS}
                    onChange={() => handleAddressModeChange(fileType, ADDRESS_MODES.COMPONENTS)}
                    className="mr-2"
                  />
                  <span className="text-sm">Multiple Address Components</span>
                </label>
              </div>

              {/* Single Address Field Mode */}
              {state.columnMappings[fileType].addressMode === ADDRESS_MODES.SINGLE && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Complete Address Field
                  </label>
                  <select
                    value={state.columnMappings[fileType].singleAddress}
                    onChange={(e) => handleColumnChange(fileType, 'singleAddress', e.target.value)}
                    className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm ${
                      !state.columnMappings[fileType].singleAddress ? 'bg-yellow-50' : 'bg-white'
                    }`}
                  >
                    <option value="">Select address column...</option>
                    {state.parsedData[fileType]?.headers.map((header) => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Multiple Components Mode */}
              {state.columnMappings[fileType].addressMode === ADDRESS_MODES.COMPONENTS && (
                <div className="bg-white border border-gray-200 rounded-lg p-4">
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {[
                      { key: 'address1', label: 'Address Line 1' },
                      { key: 'address2', label: 'Address Line 2' },
                      { key: 'city', label: 'City' },
                      { key: 'state', label: 'State' },
                      { key: 'zip', label: 'Zip Code' }
                    ].map((field) => (
                      <div key={field.key}>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          {field.label}
                        </label>
                        <select
                          value={state.columnMappings[fileType][field.key]}
                          onChange={(e) => handleColumnChange(fileType, field.key, e.target.value)}
                          className={`w-full border border-gray-300 rounded-md px-3 py-2 text-sm ${
                            !state.columnMappings[fileType][field.key] ? 'bg-yellow-50' : 'bg-white'
                          }`}
                        >
                          <option value="">Select column...</option>
                          {state.parsedData[fileType]?.headers.map((header) => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <AddressPreview 
              parsedData={state.parsedData} 
              columnMappings={state.columnMappings} 
              fileType={fileType} 
            />
          </div>
        </div>
      ))}
      
      {canProceedToPreview && (
        <div className="text-center">
          <button
            onClick={processCustomers}
            disabled={state.processing}
            className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 transition-colors mr-4 disabled:opacity-50"
          >
            {state.processing ? 'Processing...' : 'Extract Unique Customers'}
          </button>
          <button
            onClick={() => dispatch({ type: 'SET_STEP', step: STEPS.UPLOAD })}
            className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700 transition-colors"
          >
            Back
          </button>
        </div>
      )}
    </div>
  );

  // Render results step
  const renderResults = () => (
    <div className="space-y-6">
      {/* Data Summary Section - Collapsible */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg">
        <button
          onClick={() => setDataSummaryExpanded(!dataSummaryExpanded)}
          className="w-full p-4 text-left flex items-center justify-between hover:bg-blue-100 transition-colors rounded-t-lg"
        >
          <h4 className="font-medium text-blue-900 flex items-center">
            <FileText size={16} className="mr-2" />
            Data Summary
          </h4>
          {dataSummaryExpanded ? (
            <ChevronDown size={16} className="text-blue-700" />
          ) : (
            <ChevronRight size={16} className="text-blue-700" />
          )}
        </button>
        
        {dataSummaryExpanded && (
          <div className="px-4 pb-4">
            <div className="grid md:grid-cols-2 gap-6 text-sm">
              {/* Order File Column */}
              <div className="space-y-2">
                <h5 className="font-semibold text-blue-800 mb-3 flex items-center">
                  <FileText size={16} className="mr-2" />
                  Order File
                </h5>
                <p><strong>Records:</strong> {state.parsedData[FILE_TYPES.ORDER]?.data.length || 0}</p>
                <p><strong>Customer Column:</strong> {state.columnMappings[FILE_TYPES.ORDER].customer || 'None'}</p>
                <p><strong>Address Mode:</strong> {state.columnMappings[FILE_TYPES.ORDER].addressMode === ADDRESS_MODES.SINGLE ? 'Single Field' : 'Multiple Components'}</p>
                {state.columnMappings[FILE_TYPES.ORDER].addressMode === ADDRESS_MODES.SINGLE ? (
                  <p><strong>Address Field:</strong> {state.columnMappings[FILE_TYPES.ORDER].singleAddress || 'None'}</p>
                ) : (
                  <div>
                    <p><strong>Address Components:</strong></p>
                    <ul className="ml-4 mt-1 text-xs space-y-1">
                      {state.columnMappings[FILE_TYPES.ORDER].address1 && <li>• Address 1: {state.columnMappings[FILE_TYPES.ORDER].address1}</li>}
                      {state.columnMappings[FILE_TYPES.ORDER].address2 && <li>• Address 2: {state.columnMappings[FILE_TYPES.ORDER].address2}</li>}
                      {state.columnMappings[FILE_TYPES.ORDER].city && <li>• City: {state.columnMappings[FILE_TYPES.ORDER].city}</li>}
                      {state.columnMappings[FILE_TYPES.ORDER].state && <li>• State: {state.columnMappings[FILE_TYPES.ORDER].state}</li>}
                      {state.columnMappings[FILE_TYPES.ORDER].zip && <li>• Zip: {state.columnMappings[FILE_TYPES.ORDER].zip}</li>}
                    </ul>
                  </div>
                )}
              </div>
              
              {/* Commission File Column */}
              <div className="space-y-2">
                <h5 className="font-semibold text-blue-800 mb-3 flex items-center">
                  <FileText size={16} className="mr-2" />
                  Commission File
                </h5>
                <p><strong>Records:</strong> {state.parsedData[FILE_TYPES.COMMISSION]?.data.length || 0}</p>
                <p><strong>Customer Column:</strong> {state.columnMappings[FILE_TYPES.COMMISSION].customer || 'None'}</p>
                <p><strong>Address Mode:</strong> {state.columnMappings[FILE_TYPES.COMMISSION].addressMode === ADDRESS_MODES.SINGLE ? 'Single Field' : 'Multiple Components'}</p>
                {state.columnMappings[FILE_TYPES.COMMISSION].addressMode === ADDRESS_MODES.SINGLE ? (
                  <p><strong>Address Field:</strong> {state.columnMappings[FILE_TYPES.COMMISSION].singleAddress || 'None'}</p>
                ) : (
                  <div>
                    <p><strong>Address Components:</strong></p>
                    <ul className="ml-4 mt-1 text-xs space-y-1">
                      {state.columnMappings[FILE_TYPES.COMMISSION].address1 && <li>• Address 1: {state.columnMappings[FILE_TYPES.COMMISSION].address1}</li>}
                      {state.columnMappings[FILE_TYPES.COMMISSION].address2 && <li>• Address 2: {state.columnMappings[FILE_TYPES.COMMISSION].address2}</li>}
                      {state.columnMappings[FILE_TYPES.COMMISSION].city && <li>• City: {state.columnMappings[FILE_TYPES.COMMISSION].city}</li>}
                      {state.columnMappings[FILE_TYPES.COMMISSION].state && <li>• State: {state.columnMappings[FILE_TYPES.COMMISSION].state}</li>}
                      {state.columnMappings[FILE_TYPES.COMMISSION].zip && <li>• Zip: {state.columnMappings[FILE_TYPES.COMMISSION].zip}</li>}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Results Header with Compact Action Menu */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center">
          <Users className="mr-2" size={20} />
          Unique Customers Found: {state.uniqueCustomers.length}
        </h3>
        <div className="flex items-center bg-gray-50 rounded-lg p-1 border border-gray-200">
          {noAddressCount > 0 && (
            <button
              onClick={removeNoAddressRecords}
              className="bg-orange-500 text-white px-3 py-1.5 rounded-md hover:bg-orange-600 transition-colors flex items-center text-sm mr-1"
              title={`Remove ${noAddressCount} record(s) with no address`}
            >
              <AlertCircle size={14} className="mr-1" />
              Remove No Address ({noAddressCount})
            </button>
          )}
          <button
            onClick={downloadCSV}
            className="bg-green-500 text-white px-3 py-1.5 rounded-md hover:bg-green-600 transition-colors flex items-center text-sm mr-1"
          >
            <Download size={14} className="mr-1" />
            Download CSV
          </button>
          <button
            onClick={reset}
            className="bg-gray-500 text-white px-3 py-1.5 rounded-md hover:bg-gray-600 transition-colors text-sm"
          >
            Start Over
          </button>
        </div>
      </div>

      {noAddressCount > 0 && (
        <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="text-orange-600 mr-2" size={16} />
            <p className="text-sm text-orange-800">
              <strong>{noAddressCount}</strong> record(s) found with no address information.
            </p>
          </div>
        </div>
      )}
      
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="max-h-96 overflow-y-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                {['Customer Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip Code', 'Source'].map((header) => (
                  <th key={header} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {state.uniqueCustomers.map((customer, index) => (
                <CustomerTableRow key={index} customer={customer} index={index} />
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="bg-white rounded-lg shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Customer Address Extractor
            </h1>
            <p className="text-gray-600">
              Extract and consolidate unique customer names and addresses from order-commission CSV file pairs
            </p>
          </div>

          <StepIndicator currentStep={state.step} />

          {state.step === STEPS.UPLOAD && (
            <FileUploadStep 
              files={state.files} 
              onFileUpload={handleFileUpload} 
              onContinue={() => dispatch({ type: 'SET_STEP', step: STEPS.COLUMN_SELECTION })} 
            />
          )}
          {state.step === STEPS.COLUMN_SELECTION && renderColumnSelection()}
          {state.step === STEPS.RESULTS && renderResults()}
        </div>
      </div>
    </div>
  );
};

export default CustomerAddressExtractor;