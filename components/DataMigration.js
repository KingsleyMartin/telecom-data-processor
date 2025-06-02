"use client";

import React, { useState, useCallback } from 'react';
import { Upload, Download, FileText, Users, MapPin, AlertCircle, CheckCircle, X } from 'lucide-react';

const DataMigrationApp = () => {
  const [orderFile, setOrderFile] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [results, setResults] = useState({
    customers: [],
    locations: []
  });
  const [error, setError] = useState('');

  // Helper function to clean and normalize text
  const cleanText = (text) => {
    if (!text || text === null || text === undefined) return '';
    return String(text).trim();
  };

  // Parse CSV content
  const parseCSV = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { data: [], headers: [] };
    
    const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
      const values = [];
      let current = '';
      let inQuotes = false;
      
      for (let j = 0; j < lines[i].length; j++) {
        const char = lines[i][j];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          values.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current.trim());
      
      if (values.length === headers.length) {
        const row = {};
        headers.forEach((header, index) => {
          row[header] = values[index] || '';
        });
        data.push(row);
      }
    }
    
    return { data, headers };
  };

  // Extract customer and location data from parsed CSV
  const extractData = (parsedData, fileName) => {
    const customers = new Map();
    const locations = new Map();
    
    parsedData.data.forEach(row => {
      // Extract customer name
      let customerName = '';
      if (row['Customer']) customerName = cleanText(row['Customer']);
      else if (row['Customer Name']) customerName = cleanText(row['Customer Name']);
      
      if (!customerName) return;
      
      // Extract address components based on common field patterns
      let address1 = '';
      let address2 = '';
      let city = '';
      let state = '';
      
      // Try different address field combinations
      if (row['Location']) {
        address1 = cleanText(row['Location']);
      } else if (row['Address']) {
        address1 = cleanText(row['Address']);
        address2 = cleanText(row['Address Line 2'] || row['Address 2']);
      } else if (row['Street Address']) {
        address1 = cleanText(row['Street Address']);
        const suite = cleanText(row['Suite/Unit/Floor/Apt'] || row['Suite']);
        if (suite) address1 += ', ' + suite;
      } else if (row['Location Address']) {
        address1 = cleanText(row['Location Address']);
      }
      
      // Extract city and state
      city = cleanText(row['City'] || '');
      state = cleanText(row['State'] || '');
      
      // Handle combined city/state/zip fields
      if (!city && !state && row['Location City State Zip']) {
        const cityStateZip = cleanText(row['Location City State Zip']);
        const parts = cityStateZip.split(' ');
        if (parts.length >= 3) {
          state = parts[parts.length - 2];
          city = parts.slice(0, -2).join(' ');
        }
      }
      
      // Only process if we have both customer name and address
      if (customerName && address1) {
        const customerKey = customerName.toUpperCase();
        
        // Customer processing - only add first occurrence
        if (!customers.has(customerKey)) {
          customers.set(customerKey, {
            Customer: customerName,
            'Address 1': address1,
            'URL (Google)': '',
            'Address 2': address2,
            City: city,
            State: state
          });
        }
        
        // Location processing - unique combination of customer and address
        const locationKey = `${customerKey}_${address1.toUpperCase()}`;
        if (!locations.has(locationKey)) {
          locations.set(locationKey, {
            Customer: customerName,
            'Address 1': address1,
            'Address 2': address2,
            City: city,
            State: state,
            'Country (Google)': ''
          });
        }
      }
    });
    
    return {
      customers: Array.from(customers.values()),
      locations: Array.from(locations.values())
    };
  };

  const arrayToCSV = (data) => {
    if (!data || data.length === 0) return '';
    
    const headers = Object.keys(data[0]);
    const csvRows = [];
    
    // Add headers
    csvRows.push(headers.map(header => `"${header}"`).join(','));
    
    // Add data rows
    data.forEach(row => {
      const values = headers.map(header => {
        const value = row[header] || '';
        return `"${String(value).replace(/"/g, '""')}"`;
      });
      csvRows.push(values.join(','));
    });
    
    return csvRows.join('\n');
  };

  // Handle file upload
  const handleFileUpload = useCallback((event) => {
    const file = event.target.files[0];
    if (file && file.type === 'text/csv') {
      setOrderFile(file);
      setError('');
    } else {
      setError('Please upload a valid CSV file');
    }
  }, []);

  // Process the file
  const processFiles = async () => {
    if (!orderFile) {
      setError('Please upload an Orders CSV file');
      return;
    }
    
    setProcessing(true);
    setError('');
    
    try {
      const allCustomers = new Map();
      const allLocations = new Map();
      
      // Process orders file
      const ordersContent = await orderFile.text();
      const ordersData = parseCSV(ordersContent);
      const ordersExtracted = extractData(ordersData, orderFile.name);
      
      // Add customers (first occurrence wins)
      ordersExtracted.customers.forEach(customer => {
        const key = customer.Customer.toUpperCase();
        if (!allCustomers.has(key)) {
          allCustomers.set(key, customer);
        }
      });
      
      // Add locations
      ordersExtracted.locations.forEach(location => {
        const key = `${location.Customer.toUpperCase()}_${location['Address 1'].toUpperCase()}`;
        if (!allLocations.has(key)) {
          allLocations.set(key, location);
        }
      });
      
      // Convert to arrays and sort
      const customers = Array.from(allCustomers.values()).sort((a, b) => 
        a.Customer.localeCompare(b.Customer)
      );
      const locations = Array.from(allLocations.values()).sort((a, b) => 
        a.Customer.localeCompare(b.Customer)
      );
      
      setResults({
        customers,
        locations
      });
      
    } catch (err) {
      setError(`Error processing file: ${err.message}`);
    } finally {
      setProcessing(false);
    }
  };

  // Download CSV file
  const downloadCSV = (data, filename) => {
    // Generate CSV content from data array
    const csvContent = arrayToCSV(data);
    
    // Create blob with proper CSV content type and UTF-8 BOM for Excel compatibility
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { 
      type: 'text/csv;charset=utf-8;' 
    });
    
    // Create download link
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    // Trigger download
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Clean up
    window.URL.revokeObjectURL(url);
  };

  // Reset application
  const reset = () => {
    setOrderFile(null);
    setResults({
      customers: [],
      locations: []
    });
    setError('');
    // Clear file input
    const input = document.querySelector('input[type="file"]');
    if (input) input.value = '';
  };

  return (
    <div className="max-w-6xl mx-auto p-6 bg-white">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-800 mb-2">TSD Data Migration Tool</h1>
        <p className="text-gray-600">
          Process Orders reports to generate Customer and Location import templates for ForgeOS
        </p>
      </div>

      {/* File Upload Section */}
      <div className="max-w-md mx-auto mb-8">
        <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 hover:border-blue-400 transition-colors">
          <div className="text-center">
            <Upload className="mx-auto h-16 w-16 text-gray-400 mb-4" />
            <label className="cursor-pointer">
              <span className="text-xl font-medium text-gray-700">Upload Orders Report</span>
              <input
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
            <p className="text-sm text-gray-500 mt-2">CSV files only</p>
            {orderFile && (
              <div className="mt-4 flex items-center justify-center text-green-600">
                <CheckCircle className="h-5 w-5 mr-2" />
                <span className="text-sm">{orderFile.name}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-500 mr-3" />
            <span className="text-red-700">{error}</span>
          </div>
        </div>
      )}

      {/* Process Button */}
      <div className="mb-8 text-center">
        <button
          onClick={processFiles}
          disabled={!orderFile || processing}
          className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-medium py-3 px-8 rounded-lg transition-colors"
        >
          {processing ? 'Processing...' : 'Process Orders File'}
        </button>
        
        {orderFile && (
          <button
            onClick={reset}
            className="ml-4 bg-gray-500 hover:bg-gray-600 text-white font-medium py-3 px-8 rounded-lg transition-colors"
          >
            <X className="h-4 w-4 inline mr-2" />
            Reset
          </button>
        )}
      </div>

      {/* Results Section */}
      {results.customers.length > 0 && (
        <div className="space-y-8">
          {/* Summary */}
          <div className="bg-green-50 border border-green-200 rounded-lg p-6">
            <h2 className="text-xl font-semibold text-green-800 mb-4">
              Processing Complete!
            </h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div className="flex items-center">
                <Users className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{results.customers.length}</strong> unique customers found
                </span>
              </div>
              <div className="flex items-center">
                <MapPin className="h-6 w-6 text-green-600 mr-3" />
                <span className="text-green-700">
                  <strong>{results.locations.length}</strong> unique locations found
                </span>
              </div>
            </div>
          </div>

          {/* Download Section */}
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <FileText className="h-6 w-6 text-blue-600 mr-3" />
                <h3 className="text-lg font-semibold text-blue-800">Customer Import Template</h3>
              </div>
              <p className="text-blue-700 mb-4">
                Download this template, fill in any remaining required fields, then upload to ForgeOS to create customer records.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => downloadCSV(results.customers, 'Customer_Import_Template.csv')}
                  className="w-full bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  <Download className="h-4 w-4 inline mr-2" />
                  Download Customer Template
                </button>
                <p className="text-xs text-blue-600">
                  {results.customers.length} records • CSV format for Excel
                </p>
              </div>
            </div>

            <div className="bg-purple-50 border border-purple-200 rounded-lg p-6">
              <div className="flex items-center mb-4">
                <MapPin className="h-6 w-6 text-purple-600 mr-3" />
                <h3 className="text-lg font-semibold text-purple-800">Location Import Template</h3>
              </div>
              <p className="text-purple-700 mb-4">
                Download this template, fill in any remaining required fields, then upload to ForgeOS to create location records.
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => downloadCSV(results.locations, 'Location_Import_Template.csv')}
                  className="w-full bg-purple-600 hover:bg-purple-700 text-white font-medium py-2 px-4 rounded transition-colors"
                >
                  <Download className="h-4 w-4 inline mr-2" />
                  Download Location Template
                </button>
                <p className="text-xs text-purple-600">
                  {results.locations.length} records • CSV format for Excel
                </p>
              </div>
            </div>
          </div>

          {/* Sample Data Preview */}
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Sample Customer Records</h3>
              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Address</th>
                      <th className="text-left p-2">City, State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.customers.slice(0, 5).map((customer, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2">{customer.Customer}</td>
                        <td className="p-2">{customer['Address 1']}</td>
                        <td className="p-2">{customer.City && customer.State ? `${customer.City}, ${customer.State}` : customer.City || customer.State}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.customers.length > 5 && (
                  <p className="text-gray-500 text-center mt-2">...and {results.customers.length - 5} more</p>
                )}
              </div>
            </div>

            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Sample Location Records</h3>
              <div className="bg-gray-50 rounded-lg p-4 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Customer</th>
                      <th className="text-left p-2">Address</th>
                      <th className="text-left p-2">City, State</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.locations.slice(0, 5).map((location, index) => (
                      <tr key={index} className="border-b">
                        <td className="p-2">{location.Customer}</td>
                        <td className="p-2">{location['Address 1']}</td>
                        <td className="p-2">{location.City && location.State ? `${location.City}, ${location.State}` : location.City || location.State}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {results.locations.length > 5 && (
                  <p className="text-gray-500 text-center mt-2">...and {results.locations.length - 5} more</p>
                )}
              </div>
            </div>
          </div>

          {/* Instructions */}
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-yellow-800 mb-3">Next Steps</h3>
            <ol className="list-decimal list-inside space-y-2 text-yellow-700">
              <li>Download both the Customer Import Template and Location Import Template</li>
              <li>Fill out any remaining required columns in each template</li>
              <li>Upload the completed Customer Import Template to ForgeOS to create customer records</li>
              <li>Upload the completed Location Import Template to ForgeOS to create location records</li>
            </ol>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataMigrationApp;