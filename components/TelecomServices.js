"use client";

import React, { useState, useEffect } from 'react';
import { Search, MapPin, Phone, Wifi, DollarSign, Calendar, Package, Download, Upload, FileText } from 'lucide-react';

const TelecomServicesApp = () => {
  const [data, setData] = useState({ matches: [], unmatched: [] });
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState({
    locations: null,
    commissions: null
  });
  const [useDefaultFiles, setUseDefaultFiles] = useState(false);
  const [columnMapping, setColumnMapping] = useState({
    customerColumn: '',
    productColumn: '',
    providerColumn: '',
    addressColumn: ''
  });
  const [showColumnMapping, setShowColumnMapping] = useState(false);
  const [fileHeaders, setFileHeaders] = useState({
    locations: [],
    commissions: []
  });

  const handleFileUpload = async (event, fileType) => {
    const file = event.target.files[0];
    if (file) {
      setUploadedFiles(prev => ({
        ...prev,
        [fileType]: file
      }));
      setUseDefaultFiles(false);

      // Read file headers for column mapping
      try {
        const fileContent = await readFileAsText(file);
        const Papa = await import('papaparse');
        const parsed = Papa.parse(fileContent, {
          header: true,
          preview: 1, // Only read first row to get headers
          skipEmptyLines: true,
          delimitersToGuess: [',', '\t', '|', ';']
        });

        setFileHeaders(prev => ({
          ...prev,
          [fileType]: parsed.meta.fields || []
        }));

        // Auto-detect common column names
        if (fileType === 'commissions') {
          const headers = parsed.meta.fields || [];
          const productColumn = headers.find(h => 
            h.toLowerCase().includes('product') || 
            h.toLowerCase().includes('service') ||
            h.toLowerCase().includes('description')
          ) || '';
          const customerColumn = headers.find(h => 
            h.toLowerCase().includes('customer') || 
            h.toLowerCase().includes('client') ||
            h.toLowerCase().includes('company')
          ) || '';
          const providerColumn = headers.find(h => 
            h.toLowerCase().includes('provider') || 
            h.toLowerCase().includes('vendor') ||
            h.toLowerCase().includes('supplier')
          ) || '';

          setColumnMapping(prev => ({
            ...prev,
            productColumn,
            customerColumn,
            providerColumn
          }));
        }

        if (fileType === 'locations') {
          const headers = parsed.meta.fields || [];
          const customerColumn = headers.find(h => 
            h.toLowerCase().includes('customer') || 
            h.toLowerCase().includes('client') ||
            h.toLowerCase().includes('company')
          ) || '';
          const addressColumn = headers.find(h => 
            h.toLowerCase().includes('address') || 
            h.toLowerCase().includes('street') ||
            h.toLowerCase().includes('location')
          ) || '';

          setColumnMapping(prev => ({
            ...prev,
            customerColumn: customerColumn || prev.customerColumn,
            addressColumn
          }));
        }

      } catch (error) {
        console.error('Error reading file headers:', error);
      }
    }
  };

  const processUploadedFiles = async () => {
    if (!uploadedFiles.locations || !uploadedFiles.commissions) {
      alert('Please upload both location and commission files.');
      return;
    }

    if (!columnMapping.customerColumn || !columnMapping.productColumn) {
      setShowColumnMapping(true);
      return;
    }

    setUploading(true);
    try {
      await processData(uploadedFiles.locations, uploadedFiles.commissions, false);
    } catch (error) {
      console.error('Error processing uploaded files:', error);
      alert('Error processing files. Please check the file formats and try again.');
    }
    setUploading(false);
  };

  const processData = async (locationsFile, commissionsFile, isDefault = true) => {
    try {
      let locationData, commissionData;

      if (isDefault) {
        // Read default files from window.fs
        locationData = await window.fs.readFile(locationsFile, { encoding: 'utf8' });
        const commissionRawData = await window.fs.readFile(commissionsFile);
        commissionData = new TextDecoder('utf-8').decode(commissionRawData);
      } else {
        // Read uploaded files
        locationData = await readFileAsText(locationsFile);
        commissionData = await readFileAsText(commissionsFile);
      }
      
      // Parse both datasets
      const Papa = await import('papaparse');
      
      const locations = Papa.parse(locationData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
      });

      const commissions = Papa.parse(commissionData, {
        header: true,
        dynamicTyping: true,
        skipEmptyLines: true,
        delimitersToGuess: [',', '\t', '|', ';']
      });

      // Process and match the data
      const processedData = matchDatasets(locations, commissions);
      setData(processedData);
      setLoading(false);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const readFileAsText = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsText(file);
    });
  };

  const matchDatasets = (locations, commissions) => {
    // Normalize company names for matching
    const normalizeCompanyName = (name) => {
      if (!name) return '';
      return name.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[^\w\s]/g, '')
        .trim();
    };

    // Use dynamic column mapping
    const customerCol = columnMapping.customerColumn || 'Customer';
    const productCol = columnMapping.productColumn || 'Product';
    const providerCol = columnMapping.providerColumn || 'Provider';
    const addressCol = columnMapping.addressColumn || 'Address 1';

    const locationCustomers = locations.data.map(loc => {
      const address1 = loc[addressCol] || loc['Address 1'] || '';
      const address2 = loc['Address 2'] || '';
      const city = loc.City || '';
      const state = loc.State || '';
      
      return {
        original: loc[customerCol] || loc.Customer,
        normalized: normalizeCompanyName(loc[customerCol] || loc.Customer),
        fullAddress: `${address1}${address2 ? ', ' + address2 : ''}, ${city}, ${state}`,
        city: city,
        state: state,
        ...loc
      };
    });

    const commissionCustomers = commissions.data.map(comm => ({
      original: comm[customerCol] || comm.Customer,
      normalized: normalizeCompanyName(comm[customerCol] || comm.Customer),
      product: comm[productCol] || comm.Product,
      provider: comm[providerCol] || comm.Provider,
      ...comm
    }));

    // Match locations with services
    const matches = [];
    const unmatched = [];

    locationCustomers.forEach(locCustomer => {
      const matchingCommissions = commissionCustomers.filter(commCustomer => 
        commCustomer.normalized === locCustomer.normalized
      );
      
      if (matchingCommissions.length > 0) {
        const services = matchingCommissions.map(comm => ({
          product: comm.product,
          provider: comm.provider,
          qty: comm.Qty,
          netBilled: comm['Net Billed'],
          installDate: comm['Install Date'],
          invoiceDate: comm['Invoice Date'],
          agentComm: comm['Agent comm.']
        }));
        
        matches.push({
          customer: locCustomer.original,
          address: locCustomer.fullAddress,
          city: locCustomer.city,
          state: locCustomer.state,
          services: services
        });
      } else {
        unmatched.push({
          customer: locCustomer.original,
          address: locCustomer.fullAddress,
          city: locCustomer.city,
          state: locCustomer.state
        });
      }
    });

    return { matches, unmatched };
  };

  const getServiceIcon = (product) => {
    if (!product) return <Package className="w-4 h-4" />;
    const productLower = product.toLowerCase();
    if (productLower.includes('internet') || productLower.includes('fiber')) {
      return <Wifi className="w-4 h-4" />;
    }
    if (productLower.includes('phone') || productLower.includes('voice')) {
      return <Phone className="w-4 h-4" />;
    }
    return <Package className="w-4 h-4" />;
  };

  const formatCurrency = (amount) => {
    if (!amount || amount === 0) return '$0.00';
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return 'N/A';
    try {
      return new Date(dateStr).toLocaleDateString();
    } catch {
      return dateStr;
    }
  };

  const exportToCSV = () => {
    // Create CSV headers
    const headers = [
      'Company Name',
      'Address',
      'City',
      'State',
      'Service Product',
      'Provider',
      'Quantity',
      'Net Billed',
      'Agent Commission',
      'Install Date',
      'Invoice Date',
      'Has Services'
    ];

    // Create CSV rows
    const rows = [];
    
    // Add matched locations with services
    data.matches.forEach(location => {
      if (location.services && location.services.length > 0) {
        location.services.forEach(service => {
          rows.push([
            location.customer,
            location.address,
            location.city,
            location.state,
            service.product || '',
            service.provider || '',
            service.qty || '',
            service.netBilled || '',
            service.agentComm || '',
            service.installDate || '',
            service.invoiceDate || '',
            'Yes'
          ]);
        });
      } else {
        rows.push([
          location.customer,
          location.address,
          location.city,
          location.state,
          '',
          '',
          '',
          '',
          '',
          '',
          '',
          'No'
        ]);
      }
    });

    // Add unmatched locations
    data.unmatched.forEach(location => {
      rows.push([
        location.customer,
        location.address,
        location.city,
        location.state,
        '',
        '',
        '',
        '',
        '',
        '',
        '',
        'No'
      ]);
    });

    // Convert to CSV format
    const csvContent = [
      headers.join(','),
      ...rows.map(row => 
        row.map(field => {
          // Escape fields that contain commas, quotes, or newlines
          const stringField = String(field || '');
          if (stringField.includes(',') || stringField.includes('"') || stringField.includes('\n')) {
            return `"${stringField.replace(/"/g, '""')}"`;
          }
          return stringField;
        }).join(',')
      )
    ].join('\n');

    // Create and download the file
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `telecom_services_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const filteredData = () => {
    let dataToFilter = selectedFilter === 'matched' ? data.matches : 
                      selectedFilter === 'unmatched' ? data.unmatched.map(item => ({...item, services: []})) :
                      [...data.matches, ...data.unmatched.map(item => ({...item, services: []}))];
    
    if (searchTerm) {
      dataToFilter = dataToFilter.filter(item =>
        item.customer.toLowerCase().includes(searchTerm.toLowerCase()) ||
        item.address.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (item.services && item.services.some(service => 
          service.product?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          service.provider?.toLowerCase().includes(searchTerm.toLowerCase())
        ))
      );
    }
    
    return dataToFilter;
  };

  if (loading || uploading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">
            {loading ? 'Loading telecom services data...' : 'Processing uploaded files...'}
          </p>
        </div>
      </div>
    );
  }

  const filtered = filteredData();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Telecom Services Directory</h1>
              <p className="mt-2 text-gray-600">
                Company locations and their associated telecom services
              </p>
            </div>
            <div className="mt-4 md:mt-0 flex flex-col sm:flex-row gap-3">
              <button
                onClick={exportToCSV}
                disabled={data.matches.length === 0 && data.unmatched.length === 0}
                className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                <Download className="w-4 h-4" />
                Export CSV
              </button>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                <input
                  type="text"
                  placeholder="Search companies, addresses, or services..."
                  className="pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 w-full sm:w-80"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                value={selectedFilter}
                onChange={(e) => setSelectedFilter(e.target.value)}
              >
                <option value="all">All Locations ({data.matches.length + data.unmatched.length})</option>
                <option value="matched">With Services ({data.matches.length})</option>
                <option value="unmatched">No Services ({data.unmatched.length})</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {(data.matches.length === 0 && data.unmatched.length === 0) && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
            <div className="text-center">
              <Upload className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-gray-900 mb-4">Upload Your Data Files</h2>
              <p className="text-gray-600 mb-8">
                Upload your location template and commission statements to analyze telecom services.
              </p>
              
              <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 transition-colors">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-2">Company Locations File</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    CSV file with Customer, Address, City, State columns
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'locations')}
                    className="hidden"
                    id="locations-upload"
                  />
                  <label
                    htmlFor="locations-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Choose File
                  </label>
                  {uploadedFiles.locations && (
                    <p className="mt-2 text-sm text-green-600">
                      ✓ {uploadedFiles.locations.name}
                    </p>
                  )}
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 hover:border-blue-400 transition-colors">
                  <FileText className="w-8 h-8 text-gray-400 mx-auto mb-3" />
                  <h3 className="font-semibold text-gray-900 mb-2">Commission or Orders File</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    CSV file with Customer, Product, Provider, billing data
                  </p>
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => handleFileUpload(e, 'commissions')}
                    className="hidden"
                    id="commissions-upload"
                  />
                  <label
                    htmlFor="commissions-upload"
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 cursor-pointer transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Choose File
                  </label>
                  {uploadedFiles.commissions && (
                    <p className="mt-2 text-sm text-green-600">
                      ✓ {uploadedFiles.commissions.name}
                    </p>
                  )}
                </div>
              </div>

              {(uploadedFiles.locations && uploadedFiles.commissions) && (
                <div className="mt-8">
                  <button
                    onClick={() => setShowColumnMapping(true)}
                    className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors mr-4"
                  >
                    Configure Columns
                  </button>
                  <button
                    onClick={processUploadedFiles}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                  >
                    Process Files
                  </button>
                </div>
              )}

              <div className="mt-4">
                <p className="text-sm text-gray-500">
                  Expected file formats: CSV files with headers matching the template structure
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showColumnMapping && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-96 overflow-y-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-4">Configure Column Mapping</h3>
            <p className="text-gray-600 mb-6">
              Select which columns contain the key information for matching services to locations.
            </p>
            
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Commission File Columns</h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer/Company Column *
                  </label>
                  <select
                    value={columnMapping.customerColumn}
                    onChange={(e) => setColumnMapping(prev => ({...prev, customerColumn: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select column...</option>
                    {fileHeaders.commissions.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Product/Service Column *
                  </label>
                  <select
                    value={columnMapping.productColumn}
                    onChange={(e) => setColumnMapping(prev => ({...prev, productColumn: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select column...</option>
                    {fileHeaders.commissions.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Provider/Vendor Column
                  </label>
                  <select
                    value={columnMapping.providerColumn}
                    onChange={(e) => setColumnMapping(prev => ({...prev, providerColumn: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select column...</option>
                    {fileHeaders.commissions.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <h4 className="font-semibold text-gray-900 mb-3">Location File Columns</h4>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Customer/Company Column
                  </label>
                  <select
                    value={columnMapping.customerColumn}
                    onChange={(e) => setColumnMapping(prev => ({...prev, customerColumn: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select column...</option>
                    {fileHeaders.locations.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Address Column
                  </label>
                  <select
                    value={columnMapping.addressColumn}
                    onChange={(e) => setColumnMapping(prev => ({...prev, addressColumn: e.target.value}))}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select column...</option>
                    {fileHeaders.locations.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => setShowColumnMapping(false)}
                className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setShowColumnMapping(false);
                  processUploadedFiles();
                }}
                disabled={!columnMapping.customerColumn || !columnMapping.productColumn}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
              >
                Apply & Process
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {(data.matches.length > 0 || data.unmatched.length > 0) && (
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="text-sm text-gray-600">
                Data Source: Uploaded Files
              </div>
            </div>
            {(
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setUploadedFiles({ locations: null, commissions: null });
                    setData({ matches: [], unmatched: [] });
                  }}
                  className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50"
                >
                  Upload New Files
                </button>
              </div>
            )}
          </div>
        )}

        <div className="grid gap-6">
          {filtered.map((item, index) => (
            <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
              <div className="p-6">
                <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start">
                  <div className="flex-1">
                    <div className="flex items-start gap-3">
                      <MapPin className="w-5 h-5 text-gray-400 mt-1 flex-shrink-0" />
                      <div>
                        <h3 className="text-xl font-semibold text-gray-900 mb-1">
                          {item.customer}
                        </h3>
                        <p className="text-gray-600 mb-3">{item.address}</p>
                        
                        {item.services && item.services.length > 0 ? (
                          <div className="space-y-3">
                            <h4 className="text-lg font-medium text-gray-800 border-b border-gray-200 pb-2">
                              Active Services ({item.services.length})
                            </h4>
                            <div className="grid gap-3">
                              {item.services.map((service, serviceIndex) => (
                                <div key={serviceIndex} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                                  <div className="flex items-center gap-3 flex-1">
                                    {getServiceIcon(service.product)}
                                    <div>
                                      <p className="font-medium text-gray-900">{service.product}</p>
                                      <p className="text-sm text-gray-600">Provider: {service.provider}</p>
                                      {service.qty > 0 && (
                                        <p className="text-sm text-gray-600">Quantity: {service.qty}</p>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-right">
                                    <div className="flex items-center gap-1 text-sm text-gray-600 mb-1">
                                      <DollarSign className="w-3 h-3" />
                                      <span>Billed: {formatCurrency(service.netBilled)}</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-sm text-gray-600">
                                      <Calendar className="w-3 h-3" />
                                      <span>Invoice: {formatDate(service.invoiceDate)}</span>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-yellow-800 font-medium">No Services Found</p>
                            <p className="text-yellow-600 text-sm mt-1">
                              This location doesn't have any associated telecom services in the commission data.
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
          
          {filtered.length === 0 && (
            <div className="text-center py-12">
              <Search className="w-12 h-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No Results Found</h3>
              <p className="text-gray-600">Try adjusting your search terms or filters.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default TelecomServicesApp;