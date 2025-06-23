"use client";

import { useState, useCallback, useMemo } from 'react';
import { FileText, Upload, Download, Settings, Eye, EyeOff, Edit3, X, CheckCircle, AlertCircle, Info, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

// Constants
const STEPS = { UPLOAD: 1, WORKSHEET_SELECTION: 1.5, MAPPING: 2, RESULTS: 3 };

// Snackbar Component
const Snackbar = ({ notification, onClose }) => {
  const getIcon = () => {
    switch (notification.type) {
      case 'success': return <CheckCircle className="w-5 h-5" />;
      case 'error': return <AlertCircle className="w-5 h-5" />;
      case 'warning': return <AlertTriangle className="w-5 h-5" />;
      default: return <Info className="w-5 h-5" />;
    }
  };

  const getStyles = () => {
    switch (notification.type) {
      case 'success': return 'bg-green-50 border-green-200 text-green-800';
      case 'error': return 'bg-red-50 border-red-200 text-red-800';
      case 'warning': return 'bg-yellow-50 border-yellow-200 text-yellow-800';
      default: return 'bg-blue-50 border-blue-200 text-blue-800';
    }
  };

  return (
    <div className={`flex items-center gap-3 p-4 border rounded-lg shadow-lg ${getStyles()} animate-in slide-in-from-right duration-300`}>
      {getIcon()}
      <div className="flex-1">
        {notification.title && (
          <div className="font-medium">{notification.title}</div>
        )}
        <div className={notification.title ? 'text-sm' : ''}>{notification.message}</div>
      </div>
      <button
        onClick={onClose}
        className="p-1 hover:bg-black hover:bg-opacity-10 rounded"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};

// Snackbar Container
const SnackbarContainer = ({ notifications, onRemove }) => {
  return (
    <div className="fixed top-4 right-4 z-50 space-y-2 max-w-md">
      {notifications.map((notification) => (
        <Snackbar
          key={notification.id}
          notification={notification}
          onClose={() => onRemove(notification.id)}
        />
      ))}
    </div>
  );
};

// Custom hook for snackbar notifications
const useSnackbar = () => {
  const [notifications, setNotifications] = useState([]);

  const addNotification = useCallback((notification) => {
    const id = Date.now() + Math.random();
    const newNotification = { id, ...notification };
    
    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove after duration (default 5 seconds)
    const duration = notification.duration || 5000;
    if (duration > 0) {
      setTimeout(() => {
        setNotifications(prev => prev.filter(n => n.id !== id));
      }, duration);
    }
  }, []);

  const removeNotification = useCallback((id) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const showSuccess = useCallback((message, title = null, duration = 4000) => {
    addNotification({ type: 'success', message, title, duration });
  }, [addNotification]);

  const showError = useCallback((message, title = 'Error', duration = 6000) => {
    addNotification({ type: 'error', message, title, duration });
  }, [addNotification]);

  const showWarning = useCallback((message, title = 'Warning', duration = 5000) => {
    addNotification({ type: 'warning', message, title, duration });
  }, [addNotification]);

  const showInfo = useCallback((message, title = null, duration = 4000) => {
    addNotification({ type: 'info', message, title, duration });
  }, [addNotification]);

  return {
    notifications,
    removeNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo
  };
};

// Components (keeping the original components but removing alert calls)
const FileUploadStep = ({ onFileUpload }) => {
  const acceptedTypes = '.csv,.xlsx,.xls';

  return (
    <div className="space-y-6">
      <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
        <Upload className="mx-auto h-12 w-12 text-gray-400 mb-4" />
        <div className="text-lg font-medium text-gray-700 mb-2">
          Upload CSV or Excel Files
        </div>
        <div className="text-gray-500 mb-4">
          Select one or more CSV (.csv) or Excel (.xlsx, .xls) files to process
        </div>
        <input
          type="file"
          multiple
          accept={acceptedTypes}
          onChange={onFileUpload}
          className="hidden"
          id="file-upload"
        />
        <label
          htmlFor="file-upload"
          className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 cursor-pointer transition-colors"
        >
          Choose Files
        </label>
      </div>
    </div>
  );
};

const WorksheetSelectionStep = ({ filesWithWorksheets, onWorksheetSelection, onContinue }) => {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <FileText className="text-blue-600" />
          Select Worksheets
        </h2>
        <button
          onClick={onContinue}
          className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Continue to Mapping
        </button>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <p className="text-sm text-blue-700">
          <strong>Multiple worksheets detected:</strong> Please select the correct worksheet for each Excel file below.
        </p>
      </div>

      <div className="space-y-4">
        {filesWithWorksheets.map((file, fileIndex) => (
          <div key={fileIndex} className="border rounded-lg p-4">
            <h3 className="font-medium text-gray-800 mb-4">{file.name}</h3>
            
            <div className="space-y-3">
              {file.worksheets.map((worksheet, worksheetIndex) => (
                <label key={worksheetIndex} className="flex items-start gap-3 cursor-pointer p-3 border rounded-md hover:bg-gray-50">
                  <input
                    type="radio"
                    name={`worksheet-${fileIndex}`}
                    value={worksheetIndex}
                    checked={file.selectedWorksheetIndex === worksheetIndex}
                    onChange={(e) => onWorksheetSelection(fileIndex, parseInt(e.target.value))}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-800">{worksheet.name}</span>
                      {file.recommendedWorksheetIndex === worksheetIndex && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                          Recommended
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      {worksheet.rowCount} rows, {worksheet.columnCount} columns
                    </div>
                    {worksheet.sampleHeaders.length > 0 && (
                      <div className="text-xs text-gray-500 mt-1">
                        Headers: {worksheet.sampleHeaders.slice(0, 5).join(', ')}
                        {worksheet.sampleHeaders.length > 5 && '...'}
                      </div>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const ColumnMappingStep = ({ files, columnMappings, primaryFileIndex, mappingName, onUpdateMapping, onSetPrimaryFile, onProcessFiles, onSetMappingName, onExportMapping, onImportMapping }) => {
  const fieldTypes = ['companyName', 'address1', 'address2', 'city', 'state', 'zipCode'];
  const fieldLabels = {
    companyName: 'Company Name',
    address1: 'Address 1', 
    address2: 'Address 2',
    city: 'City',
    state: 'State',
    zipCode: 'Zip Code'
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800 flex items-center gap-2">
          <Settings className="text-blue-600" />
          Map Columns
        </h2>
        <button
          onClick={onProcessFiles}
          className="px-4 pycd vt-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
        >
          Process Files
        </button>
      </div>

      {/* Mapping Save/Load Section */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
          <Download className="text-green-600" size={16} />
          TSD Field Mappings
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Save Mapping */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Save Current Mapping
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={mappingName}
                onChange={(e) => onSetMappingName(e.target.value)}
                placeholder="Enter mapping name..."
                className="flex-1 border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <button
                onClick={onExportMapping}
                disabled={!mappingName.trim()}
                className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
                  !mappingName.trim()
                    ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                    : 'bg-green-600 text-white border-green-600 hover:bg-green-700'
                }`}
              >
                <Download size={16} />
                Save
              </button>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Downloads a JSON file with your current field mappings
            </p>
          </div>

          {/* Load Mapping */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Load Saved Mapping
            </label>
            <div className="flex gap-2">
              <input
                type="file"
                accept=".json"
                onChange={onImportMapping}
                className="hidden"
                id="mapping-upload"
              />
              <label
                htmlFor="mapping-upload"
                className="flex-1 cursor-pointer inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Upload size={16} className="mr-2" />
                Choose Mapping File
              </label>
            </div>
            <p className="text-xs text-gray-500 mt-1">
              Upload a previously saved mapping JSON file
            </p>
          </div>
        </div>
      </div>

      {files.length > 1 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <h3 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
            <FileText className="text-yellow-600" size={16} />
            Select Primary File
          </h3>
          <p className="text-sm text-gray-600 mb-3">
            Choose which file should be processed first. Records from the primary file will take priority in deduplication.
          </p>
          <div className="space-y-2">
            {files.map((file, index) => (
              <label key={index} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="primaryFile"
                  value={index}
                  checked={primaryFileIndex === index}
                  onChange={(e) => onSetPrimaryFile(parseInt(e.target.value))}
                  className="text-blue-600"
                />
                <span className="text-sm font-medium text-gray-700">{file.name}</span>
                {primaryFileIndex === index && (
                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                    Primary
                  </span>
                )}
              </label>
            ))}
          </div>
        </div>
      )}

      <div className="space-y-4">
        {files.map((file, fileIndex) => (
          <div key={fileIndex} className={`border rounded-lg p-4 ${fileIndex === primaryFileIndex ? 'border-blue-300 bg-blue-50' : ''}`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-medium text-gray-800">{file.name}</h3>
              {fileIndex === primaryFileIndex && (
                <span className="text-xs bg-blue-500 text-white px-2 py-1 rounded">
                  Primary File
                </span>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              {fieldTypes.map(fieldType => (
                <div key={fieldType}>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {fieldLabels[fieldType]}
                    {fieldType === 'companyName' && (
                      <span className="text-red-500 ml-1">*</span>
                    )}
                  </label>
                  <select
                    value={columnMappings[fileIndex]?.[fieldType] || 'none'}
                    onChange={(e) => onUpdateMapping(fileIndex, fieldType, e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="none">-- None --</option>
                    {file.headers.map((header, headerIndex) => (
                      <option key={`${fileIndex}-${headerIndex}-${header}`} value={header}>
                        {header}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

const OriginalDataModal = ({ isOpen, record, onClose }) => {
  if (!isOpen || !record || !record.originalData) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-gray-800">Original Data vs Standardized</h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 text-2xl"
          >
            ×
          </button>
        </div>
        
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-6">
            <div>
              <h3 className="font-medium text-gray-700 mb-3 text-center">Original Data</h3>
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 space-y-2">
                <div><strong>Company Name:</strong> {record.originalData.companyName}</div>
                <div><strong>Address 1:</strong> {record.originalData.address1}</div>
                <div><strong>Address 2:</strong> {record.originalData.address2}</div>
                <div><strong>City:</strong> {record.originalData.city}</div>
                <div><strong>State:</strong> {record.originalData.state}</div>
                <div><strong>Zip Code:</strong> {record.originalData.zipCode}</div>
              </div>
            </div>
            
            <div>
              <h3 className="font-medium text-gray-700 mb-3 text-center">Standardized Data</h3>
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-2">
                <div><strong>Company Name:</strong> {record.companyName}</div>
                <div><strong>Address 1:</strong> {record.address1}</div>
                <div><strong>Address 2:</strong> {record.address2}</div>
                <div><strong>City:</strong> {record.city}</div>
                <div><strong>State:</strong> {record.state}</div>
                <div><strong>Zip Code:</strong> {record.zipCode}</div>
              </div>
            </div>
          </div>
          
          <div className="flex justify-end pt-4">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const ResultsStep = ({ processedData, filteredData, selectedRecords, selectedCount, showMissingAddresses, showDuplicates, editingCell, isStandardizing, files, primaryFileIndex, onToggleRecordSelection, onToggleSelectAll, onCellEdit, onCellClick, onCellBlur, onToggleMissingAddresses, onToggleDuplicates, onStandardizeSelected, onStandardizeAll, onExport, onReset, onViewOriginalData }) => {
  const allVisibleSelected = filteredData.length > 0 && 
    filteredData.every(record => selectedRecords.has(processedData.indexOf(record)));

  const renderEditableCell = (record, field, originalIndex) => {
    const isEditing = editingCell?.recordIndex === originalIndex && editingCell?.field === field;
    const value = record[field] || '';

    if (isEditing) {
      return (
        <input
          type="text"
          value={value}
          onChange={(e) => onCellEdit(originalIndex, field, e.target.value)}
          onBlur={onCellBlur}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === 'Escape') {
              onCellBlur();
            }
          }}
          className="w-full px-2 py-1 border border-blue-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          autoFocus
        />
      );
    }

    return (
      <div
        onClick={() => onCellClick(originalIndex, field)}
        className="cursor-pointer hover:bg-gray-100 px-2 py-1 rounded min-h-[24px] flex items-center group"
        title="Click to edit"
      >
        <span className="flex-1">{value}</span>
        <Edit3 size={12} className="opacity-0 group-hover:opacity-50 ml-1" />
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold text-gray-800">
          Extracted Companies ({filteredData.length} records, {selectedCount} selected)
        </h2>
        <div className="flex gap-2">
          <button
            onClick={onStandardizeSelected}
            disabled={selectedRecords.size === 0 || isStandardizing}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              selectedRecords.size === 0 || isStandardizing
                ? 'bg-gray-100 text-gray-400 border-gray-300 cursor-not-allowed'
                : 'bg-purple-600 text-white border-purple-600 hover:bg-purple-700'
            }`}
          >
            <Settings size={16} className={isStandardizing ? 'animate-spin' : ''} />
            {isStandardizing ? 'Processing...' : `Standardize Selected (${selectedRecords.size})`}
          </button>
          <button
            onClick={onToggleMissingAddresses}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              showMissingAddresses
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'bg-blue-100 text-blue-700 border-blue-300'
            }`}
          >
            {showMissingAddresses ? <EyeOff size={16} /> : <Eye size={16} />}
            {showMissingAddresses ? 'Hide' : 'Show'} Missing Address Records
          </button>
          <button
            onClick={onToggleDuplicates}
            className={`px-4 py-2 rounded-md border flex items-center gap-2 ${
              showDuplicates
                ? 'bg-gray-100 text-gray-700 border-gray-300'
                : 'bg-orange-100 text-orange-700 border-orange-300'
            }`}
          >
            {showDuplicates ? <EyeOff size={16} /> : <Eye size={16} />}
            {showDuplicates ? 'Hide' : 'Show'} Duplicates
          </button>
          <button
            onClick={onExport}
            className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
          >
            <Download size={16} />
            Export CSVs
          </button>
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <p className="text-sm text-blue-700 flex items-center gap-2">
          <Edit3 size={16} />
          <strong>Tip:</strong> Click on any cell in the table below to edit its contents directly.
        </p>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border border-gray-300">
          <thead>
            <tr className="bg-gray-100">
              <th className="border border-gray-300 px-4 py-2 text-left">
                <input
                  type="checkbox"
                  onChange={onToggleSelectAll}
                  checked={allVisibleSelected}
                  className="rounded"
                />
              </th>
              <th className="border border-gray-300 px-4 py-2 text-left">Company Name</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Address 1</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Address 2</th>
              <th className="border border-gray-300 px-4 py-2 text-left">City</th>
              <th className="border border-gray-300 px-4 py-2 text-left">State</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Zip Code</th>
              <th className="border border-gray-300 px-4 py-2 text-left">Source</th>
            </tr>
          </thead>
          <tbody>
            {filteredData.map((record, index) => {
              let rowClass = index % 2 === 0 ? 'bg-white' : 'bg-gray-50';

              if (record.isDuplicate) {
                rowClass = 'bg-yellow-100';
              } else if (record.isSimilar) {
                rowClass = 'bg-red-100';
              } else if (record.isStandardized) {
                rowClass = index % 2 === 0 ? 'bg-green-50' : 'bg-green-100';
              }

              const originalIndex = processedData.indexOf(record);

              return (
                <tr key={index} className={rowClass}>
                  <td className="border border-gray-300 px-4 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={originalIndex !== -1 && selectedRecords.has(originalIndex)}
                      onChange={() => originalIndex !== -1 && onToggleRecordSelection(originalIndex)}
                      className="rounded"
                    />
                  </td>
                  <td className="border border-gray-300 px-2 py-1 relative">
                    {renderEditableCell(record, 'companyName', originalIndex)}
                    {record.isStandardized && (
                      <div className="absolute top-1 right-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewOriginalData(record);
                          }}
                          className="w-2 h-2 bg-green-500 rounded-full hover:bg-green-600 cursor-pointer transition-colors"
                          title="Click to view original data before standardization"
                        />
                      </div>
                    )}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {renderEditableCell(record, 'address1', originalIndex)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {renderEditableCell(record, 'address2', originalIndex)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {renderEditableCell(record, 'city', originalIndex)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {renderEditableCell(record, 'state', originalIndex)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1">
                    {renderEditableCell(record, 'zipCode', originalIndex)}
                  </td>
                  <td className="border border-gray-300 px-2 py-1 text-sm">
                    <span className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      record.source === files[primaryFileIndex]?.name 
                        ? 'bg-green-100 text-green-800' 
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {record.source}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4">
        <button
          onClick={onReset}
          className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
        >
          Start Over
        </button>
        <div className="flex gap-4 text-sm text-gray-600 items-center">
          <div className="flex items-center">
            <input type="checkbox" checked readOnly className="mr-2 rounded" />
            Select for export
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-yellow-100 border border-yellow-300 mr-2" />
            Exact duplicates
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-red-100 border border-red-300 mr-2" />
            Similar addresses (same company)
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 mr-2" />
            Standardized records
          </div>
          <div className="flex items-center">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 cursor-pointer" />
            Click to view original data
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-green-100 border border-green-300 mr-2 rounded text-xs flex items-center justify-center">
              <span className="text-green-800 font-bold">P</span>
            </div>
            Primary source file
          </div>
          <div className="flex items-center">
            <div className="w-4 h-4 bg-blue-100 border border-blue-300 mr-2 rounded text-xs flex items-center justify-center">
              <span className="text-blue-800 font-bold">S</span>
            </div>
            Secondary source file
          </div>
          <div className="flex items-center">
            <Edit3 size={14} className="mr-2 text-gray-400" />
            Click cells to edit
          </div>
        </div>
      </div>
    </div>
  );
};

const StepIndicator = ({ currentStep }) => {
  const steps = [1, 2, 3];
  const stepLabels = {
    1: 'Upload Files',
    1.5: 'Select Worksheets',
    2: 'Map Columns',
    3: 'Review Results'
  };

  // Convert decimal step to display step
  const displaySteps = currentStep === 1.5 ? [1, 1.5, 2, 3] : [1, 2, 3];
  const currentDisplayStep = currentStep;

  return (
    <div className="mb-8">
      <div className="flex items-center justify-between">
        {displaySteps.map((stepNumber, index) => (
          <div key={stepNumber} className={`flex items-center ${index < displaySteps.length - 1 ? 'flex-1' : ''}`}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              currentDisplayStep >= stepNumber ? 'bg-blue-600 text-white' : 'bg-gray-300 text-gray-600'
            }`}>
              {stepNumber === 1.5 ? '📊' : Math.floor(stepNumber)}
            </div>
            <span className={`ml-2 text-sm ${currentDisplayStep >= stepNumber ? 'text-blue-600' : 'text-gray-500'}`}>
              {stepLabels[stepNumber]}
            </span>
            {index < displaySteps.length - 1 && (
              <div className={`flex-1 h-0.5 mx-4 ${currentDisplayStep > stepNumber ? 'bg-blue-600' : 'bg-gray-300'}`} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

const ProgressIndicator = ({ current, total }) => {
  const percentage = total > 0 ? (current / total) * 100 : 0;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-blue-700">
          Standardizing Records...
        </span>
        <span className="text-sm text-blue-600">
          {current} of {total}
        </span>
      </div>
      <div className="w-full bg-blue-200 rounded-full h-2">
        <div
          className="bg-blue-600 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
      <p className="text-xs text-blue-600 mt-1">
        Please wait while we process your records through the standardization API...
      </p>
    </div>
  );
};

const useCustomerExtractor = () => {
  const [files, setFiles] = useState([]);
  const [filesWithWorksheets, setFilesWithWorksheets] = useState([]);
  const [processedData, setProcessedData] = useState([]);
  const [columnMappings, setColumnMappings] = useState({});
  const [primaryFileIndex, setPrimaryFileIndex] = useState(0);
  const [showMissingAddresses, setShowMissingAddresses] = useState(true);
  const [showDuplicates, setShowDuplicates] = useState(true);
  const [selectedRecords, setSelectedRecords] = useState(new Set());
  const [editingCell, setEditingCell] = useState(null);
  const [step, setStep] = useState(STEPS.UPLOAD);
  const [isStandardizing, setIsStandardizing] = useState(false);
  const [standardizationProgress, setStandardizationProgress] = useState({ current: 0, total: 0 });
  const [mappingName, setMappingName] = useState('');
  const [showOriginalModal, setShowOriginalModal] = useState(false);
  const [selectedOriginalRecord, setSelectedOriginalRecord] = useState(null);

  // Initialize snackbar
  const { notifications, removeNotification, showSuccess, showError, showWarning, showInfo } = useSnackbar();

  // Data processing utilities
  const parseCSV = (content) => {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) return { headers: [], data: [] };

    // Handle duplicate headers by making them unique
    const rawHeaders = lines[0].split(',').map(h => h.replace(/"/g, '').trim());
    const headers = [];
    const seenHeaders = new Set();
    
    rawHeaders.forEach((header, index) => {
      let uniqueHeader = header;
      let counter = 1;
      
      // Keep adding counter until we find a unique name
      while (seenHeaders.has(uniqueHeader)) {
        uniqueHeader = `${header} (${counter})`;
        counter++;
      }
      
      seenHeaders.add(uniqueHeader);
      headers.push(uniqueHeader);
    });

    const data = lines.slice(1).map(line => {
      const values = [];
      let current = '';
      let inQuotes = false;

      for (let i = 0; i < line.length; i++) {
        const char = line[i];
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

      const row = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return { headers, data };
  };

  const parseExcel = (fileBuffer) => {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      
      if (workbook.SheetNames.length === 1) {
        // Single worksheet - process normally
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

        if (jsonData.length === 0) return { headers: [], data: [] };

        // Handle duplicate headers by making them unique
        const rawHeaders = jsonData[0].map(h => String(h || '').trim());
        const headers = [];
        const seenHeaders = new Set();
        
        rawHeaders.forEach((header, index) => {
          let uniqueHeader = header;
          let counter = 1;
          
          // Keep adding counter until we find a unique name
          while (seenHeaders.has(uniqueHeader)) {
            uniqueHeader = `${header} (${counter})`;
            counter++;
          }
          
          seenHeaders.add(uniqueHeader);
          headers.push(uniqueHeader);
        });

        const data = jsonData.slice(1)
          .map(row => {
            const rowData = {};
            headers.forEach((header, index) => {
              rowData[header] = String(row[index] || '').trim();
            });
            return rowData;
          })
          .filter(row => Object.values(row).some(val => val));

        return { headers, data };
      } else {
        // Multiple worksheets - return worksheet info for selection
        const worksheets = workbook.SheetNames.map(sheetName => {
          const worksheet = workbook.Sheets[sheetName];
          const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
          
          if (jsonData.length === 0) {
            return {
              name: sheetName,
              rowCount: 0,
              columnCount: 0,
              sampleHeaders: [],
              score: 0
            };
          }

          const headers = jsonData[0] ? jsonData[0].map(h => String(h || '').trim()).filter(Boolean) : [];
          const dataRows = jsonData.slice(1).filter(row => row.some(cell => cell !== undefined && cell !== ''));
          
          // Calculate relevance score based on headers and data
          let score = 0;
          
          // Score for relevant keywords in headers
          const relevantKeywords = ['company', 'customer', 'business', 'organization', 'client', 'address', 'city', 'state', 'zip'];
          headers.forEach(header => {
            const lowerHeader = header.toLowerCase();
            relevantKeywords.forEach(keyword => {
              if (lowerHeader.includes(keyword)) {
                score += 10;
              }
            });
          });
          
          // Score for data density
          score += Math.min(dataRows.length, 100); // Up to 100 points for row count
          score += Math.min(headers.length, 20); // Up to 20 points for column count
          
          // Bonus for having both company and address-related headers
          const hasCompany = headers.some(h => ['company', 'customer', 'business', 'organization', 'client'].some(k => h.toLowerCase().includes(k)));
          const hasAddress = headers.some(h => ['address', 'city', 'state', 'zip'].some(k => h.toLowerCase().includes(k)));
          if (hasCompany && hasAddress) {
            score += 50;
          }
          
          return {
            name: sheetName,
            rowCount: dataRows.length,
            columnCount: headers.length,
            sampleHeaders: headers.slice(0, 10),
            score: score
          };
        });

        // Find the worksheet with the highest score
        const recommendedIndex = worksheets.reduce((bestIndex, worksheet, index) => {
          return worksheets[bestIndex].score < worksheet.score ? index : bestIndex;
        }, 0);

        return {
          isMultiWorksheet: true,
          worksheets: worksheets,
          recommendedWorksheetIndex: recommendedIndex
        };
      }
    } catch (error) {
      console.error('Error parsing Excel file:', error);
      return { headers: [], data: [] };
    }
  };

  const parseExcelWorksheet = (fileBuffer, worksheetIndex) => {
    try {
      const workbook = XLSX.read(fileBuffer, { type: 'array' });
      const sheetName = workbook.SheetNames[worksheetIndex];
      const worksheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

      if (jsonData.length === 0) return { headers: [], data: [] };

      // Handle duplicate headers by making them unique
      const rawHeaders = jsonData[0].map(h => String(h || '').trim());
      const headers = [];
      const seenHeaders = new Set();
      
      rawHeaders.forEach((header, index) => {
        let uniqueHeader = header;
        let counter = 1;
        
        // Keep adding counter until we find a unique name
        while (seenHeaders.has(uniqueHeader)) {
          uniqueHeader = `${header} (${counter})`;
          counter++;
        }
        
        seenHeaders.add(uniqueHeader);
        headers.push(uniqueHeader);
      });

      const data = jsonData.slice(1)
        .map(row => {
          const rowData = {};
          headers.forEach((header, index) => {
            rowData[header] = String(row[index] || '').trim();
          });
          return rowData;
        })
        .filter(row => Object.values(row).some(val => val));

      return { headers, data };
    } catch (error) {
      console.error('Error parsing Excel worksheet:', error);
      return { headers: [], data: [] };
    }
  };

  const detectColumnMappings = (headers) => {
    const mapping = {};
    
    // Enhanced keyword matching with exact matches and partial matches
    // Prioritize first occurrence of duplicate field names and avoid account-related fields
    const fieldMatchers = {
      companyName: (header) => {
        const lower = header.toLowerCase();
        return ['customer', 'company', 'business', 'organization', 'client'].some(keyword => 
          lower.includes(keyword) && !lower.includes('id') && !lower.includes('contact') && !lower.includes('account')
        );
      },
      address1: (header) => {
        const lower = header.toLowerCase();
        // Exact match first, then avoid account addresses and duplicates
        return lower === 'address 1' || 
               (lower.includes('address') && lower.includes('1') && 
                !lower.includes('account') && !lower.includes('('));
      },
      address2: (header) => {
        const lower = header.toLowerCase();
        // Handle the space-prefixed version and avoid account addresses and duplicates
        return lower === 'address 2' || lower === ' address 2' || 
               (lower.includes('address') && lower.includes('2') && 
                !lower.includes('account') && !lower.includes('('));
      },
      city: (header) => {
        const lower = header.toLowerCase();
        // Exact match first, avoid "Account City", "City, State" combinations, and duplicates
        return lower === 'city' || 
               (lower.includes('city') && !lower.includes('account') && 
                !lower.includes(',') && !lower.includes('('));
      },
      state: (header) => {
        const lower = header.toLowerCase();
        // Exact match first, avoid "Account State", "City, State" combinations, and duplicates
        return lower === 'state' || 
               (lower.includes('state') && !lower.includes('account') && 
                !lower.includes(',') && !lower.includes('('));
      },
      zipCode: (header) => {
        const lower = header.toLowerCase();
        // Exact matches first, avoid "Account Postal Code" and duplicates
        return lower === 'postal code' || lower === 'zip code' || lower === 'zipcode' || lower === 'zip' ||
               (lower.includes('postal') && !lower.includes('account') && !lower.includes('('));
      }
    };

    // Process headers in order to ensure we get first occurrences
    headers.forEach((header, index) => {
      Object.entries(fieldMatchers).forEach(([fieldType, matcher]) => {
        if (!mapping[fieldType] && matcher(header)) {
          mapping[fieldType] = header;
          console.log(`Auto-mapped ${fieldType} to "${header}" at position ${index}`);
        }
      });
    });

    return mapping;
  };

  const standardizeWithGemini = async (companyName, address) => {
    try {
      const response = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, address }),
      });

      if (!response.ok) throw new Error(`API call failed: ${response.status}`);
      const result = await response.json();

      if (result.success && result.data) {
        return {
          companyName: result.data["Company Name"] || companyName,
          address1: result.data["Address 1"] || '',
          address2: result.data["Address 2"] || '',
          city: result.data["City"] || '',
          state: result.data["State"] || '',
          zipCode: result.data["Zip Code"] || ''
        };
      } else {
        throw new Error('Invalid response from API');
      }
    } catch (error) {
      console.error('Error calling standardization API:', error);
      // Return original data if API fails
      return {
        companyName: companyName,
        address1: address,
        address2: '',
        city: '',
        state: '',
        zipCode: ''
      };
    }
  };

  // Mapping save/load functions with snackbar notifications
  const exportMapping = useCallback(() => {
    if (!mappingName.trim()) {
      showWarning('Please enter a name for the mapping.');
      return;
    }

    try {
      const mappingData = {
        name: mappingName.trim(),
        timestamp: new Date().toISOString(),
        files: files.map(file => ({
          name: file.name,
          headers: file.headers
        })),
        columnMappings: columnMappings,
        primaryFileIndex: primaryFileIndex,
        version: '1.0'
      };

      const dataStr = JSON.stringify(mappingData, null, 2);
      const blob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = `${mappingName.trim().replace(/[^a-z0-9]/gi, '_').toLowerCase()}_mapping.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      showSuccess(`Mapping "${mappingName}" has been saved successfully!`, 'Mapping Saved');
    } catch (error) {
      console.error('Error exporting mapping:', error);
      showError('An error occurred while saving the mapping. Please try again.');
    }
  }, [mappingName, files, columnMappings, primaryFileIndex, showSuccess, showError, showWarning]);

  const importMapping = useCallback(async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const fileContent = await file.text();
      const mappingData = JSON.parse(fileContent);

      // Validate mapping structure
      if (!mappingData.name || !mappingData.columnMappings) {
        throw new Error('Invalid mapping file format');
      }

      // Check if current files match the mapping
      if (!files || files.length === 0) {
        showWarning('Please upload files first before importing a mapping.');
        return;
      }

      // Apply the mapping
      setMappingName(mappingData.name);
      setColumnMappings(mappingData.columnMappings);
      
      if (mappingData.primaryFileIndex !== undefined && mappingData.primaryFileIndex < files.length) {
        setPrimaryFileIndex(mappingData.primaryFileIndex);
      }

      showSuccess(`Mapping "${mappingData.name}" has been loaded successfully!`, 'Mapping Loaded');
      
    } catch (error) {
      console.error('Error importing mapping:', error);
      showError('Error loading mapping file. Please check that it is a valid mapping file.');
    }

    // Reset the file input
    event.target.value = '';
  }, [files, showSuccess, showError, showWarning]);

  // Memoized computed values
  const filteredData = useMemo(() => {
    let filtered = [...processedData];
    if (!showMissingAddresses) {
      filtered = filtered.filter(record => record.address1 && record.city && record.state && record.zipCode);
    }
    if (!showDuplicates) {
      filtered = filtered.filter(record => !record.isDuplicate || record.isSelectableDuplicate);
    }
    return filtered;
  }, [processedData, showMissingAddresses, showDuplicates]);

  const selectedCount = useMemo(() => 
    filteredData.filter(record => {
      const originalIndex = processedData.indexOf(record);
      return originalIndex !== -1 && selectedRecords.has(originalIndex);
    }).length,
    [filteredData, processedData, selectedRecords]
  );

  // File upload handler with snackbar notifications
  const handleFileUpload = useCallback(async (event) => {
    try {
      const uploadedFiles = Array.from(event.target.files);
      const fileData = [];
      const filesNeedingWorksheetSelection = [];

      for (const file of uploadedFiles) {
        let parsed;
        const fileName = file.name.toLowerCase();

        if (fileName.endsWith('.csv')) {
          const content = await file.text();
          parsed = parseCSV(content);
          
          if (parsed.headers.length > 0 && parsed.data.length > 0) {
            fileData.push({
              name: file.name,
              headers: parsed.headers,
              data: parsed.data
            });
          }
        } else if (fileName.match(/\.(xlsx|xls)$/)) {
          const buffer = await file.arrayBuffer();
          parsed = parseExcel(buffer);
          
          if (parsed.isMultiWorksheet) {
            // Store file buffer for later processing
            filesNeedingWorksheetSelection.push({
              name: file.name,
              buffer: buffer,
              worksheets: parsed.worksheets,
              recommendedWorksheetIndex: parsed.recommendedWorksheetIndex,
              selectedWorksheetIndex: parsed.recommendedWorksheetIndex
            });
          } else if (parsed.headers.length > 0 && parsed.data.length > 0) {
            fileData.push({
              name: file.name,
              headers: parsed.headers,
              data: parsed.data
            });
          }
        } else {
          console.warn(`Unsupported file type: ${file.name}`);
          continue;
        }
      }

      if (fileData.length === 0 && filesNeedingWorksheetSelection.length === 0) {
        showError('No valid files were processed. Please check your file formats.', 'Upload Failed');
        return;
      }

      if (filesNeedingWorksheetSelection.length > 0) {
        // Need worksheet selection step
        setFilesWithWorksheets(filesNeedingWorksheetSelection);
        setFiles(fileData); // Store already processed files
        setStep(STEPS.WORKSHEET_SELECTION);
        showInfo(`Found multiple worksheets in ${filesNeedingWorksheetSelection.length} file(s). Please select the correct worksheets to continue.`, 'Worksheet Selection Required');
      } else {
        // All files processed, go to mapping
        setFiles(fileData);
        
        const initialMappings = {};
        fileData.forEach((file, index) => {
          initialMappings[index] = detectColumnMappings(file.headers);
        });
        setColumnMappings(initialMappings);

        const orderFileIndex = fileData.findIndex(file => file.name.toLowerCase().includes('order'));
        setPrimaryFileIndex(orderFileIndex >= 0 ? orderFileIndex : 0);
        setStep(STEPS.MAPPING);
        showSuccess(`Successfully processed ${fileData.length} file(s). Column mappings have been automatically detected where possible.`, 'Files Uploaded');
      }
    } catch (error) {
      console.error('Error uploading files:', error);
      showError('An error occurred while processing the files. Please try again.');
    }
  }, [showSuccess, showError, showInfo]);

  const handleWorksheetSelection = useCallback((fileIndex, worksheetIndex) => {
    setFilesWithWorksheets(prev => {
      const updated = [...prev];
      updated[fileIndex].selectedWorksheetIndex = worksheetIndex;
      return updated;
    });
  }, []);

  const handleContinueFromWorksheetSelection = useCallback(async () => {
    try {
      const processedWorksheetFiles = [];
      
      for (const fileWithWorksheets of filesWithWorksheets) {
        const parsed = parseExcelWorksheet(fileWithWorksheets.buffer, fileWithWorksheets.selectedWorksheetIndex);
        
        if (parsed.headers.length > 0 && parsed.data.length > 0) {
          processedWorksheetFiles.push({
            name: fileWithWorksheets.name,
            headers: parsed.headers,
            data: parsed.data
          });
        }
      }

      // Combine with already processed files
      const allFiles = [...files, ...processedWorksheetFiles];
      setFiles(allFiles);

      const initialMappings = {};
      allFiles.forEach((file, index) => {
        initialMappings[index] = detectColumnMappings(file.headers);
      });
      setColumnMappings(initialMappings);

      const orderFileIndex = allFiles.findIndex(file => file.name.toLowerCase().includes('order'));
      setPrimaryFileIndex(orderFileIndex >= 0 ? orderFileIndex : 0);
      setStep(STEPS.MAPPING);
      showSuccess(`Successfully processed ${allFiles.length} file(s) with selected worksheets.`, 'Worksheets Processed');
    } catch (error) {
      console.error('Error processing worksheet selections:', error);
      showError('An error occurred while processing the worksheet selections. Please try again.');
    }
  }, [files, filesWithWorksheets, showSuccess, showError]);

  const updateColumnMapping = useCallback((fileIndex, field, column) => {
    setColumnMappings(prev => ({
      ...prev,
      [fileIndex]: {
        ...prev[fileIndex],
        [field]: column === 'none' ? null : column
      }
    }));
  }, []);

  const processFiles = useCallback(async () => {
    try {
      const allRecords = [];
      const primaryFile = files[primaryFileIndex];
      const otherFiles = files.filter((_, index) => index !== primaryFileIndex);
      const orderedFiles = [primaryFile, ...otherFiles];

      for (const file of orderedFiles) {
        const fileIndex = files.indexOf(file);
        const mapping = columnMappings[fileIndex];

        for (const row of file.data) {
          // Skip rows without company name
          if (!mapping.companyName || !row[mapping.companyName]) continue;

          const companyName = row[mapping.companyName];
          const address1 = mapping.address1 ? row[mapping.address1] || '' : '';
          const address2 = mapping.address2 ? row[mapping.address2] || '' : '';
          const city = mapping.city ? row[mapping.city] || '' : '';
          const state = mapping.state ? row[mapping.state] || '' : '';
          const zipCode = mapping.zipCode ? row[mapping.zipCode] || '' : '';

          // Skip rows without any address information
          // At least one of: address1, city, state, or zipCode must have meaningful data
          const hasAddressInfo = [address1, city, state, zipCode].some(field => 
            field && field.trim().length > 0
          );
          
          if (!hasAddressInfo) {
            console.log(`Skipping row for company "${companyName}" - no address information found`);
            continue;
          }

          const fullAddressParts = [address1, address2, city, state, zipCode].filter(Boolean);
          const fullAddress = fullAddressParts.join(', ');

          allRecords.push({
            companyName: companyName.trim(),
            address1: address1.trim(),
            address2: address2.trim(),
            city: city.trim(),
            state: state.trim(),
            zipCode: zipCode.trim(),
            source: file.name,
            originalAddress: fullAddress,
            isStandardized: false
          });
        }
      }

      // Deduplication logic
      const uniqueRecords = [];
      const duplicateGroups = new Map();

      for (let i = 0; i < allRecords.length; i++) {
        const record = allRecords[i];
        const key = `${record.companyName.toLowerCase().trim()}_${record.address1.toLowerCase().trim()}_${record.city.toLowerCase().trim()}`;

        if (!duplicateGroups.has(key)) {
          duplicateGroups.set(key, []);
        }
        duplicateGroups.get(key).push({ ...record, originalProcessedDataIndex: i });
      }

      duplicateGroups.forEach(group => {
        group.sort((a, b) => {
          const primaryFileName = files[primaryFileIndex]?.name;
          const aIsPrimary = a.source === primaryFileName ? 1 : 0;
          const bIsPrimary = b.source === primaryFileName ? 1 : 0;
          
          if (aIsPrimary !== bIsPrimary) return bIsPrimary - aIsPrimary;
          
          const aCompleteness = [a.address1, a.address2, a.city, a.state, a.zipCode].filter(Boolean).length;
          const bCompleteness = [b.address1, b.address2, b.city, b.state, b.zipCode].filter(Boolean).length;
          return bCompleteness - aCompleteness;
        });

        const bestRecord = { ...group[0], isDuplicate: false, isSelectableDuplicate: true };
        uniqueRecords.push(bestRecord);

        for (let i = 1; i < group.length; i++) {
          uniqueRecords.push({ ...group[i], isDuplicate: true, isSelectableDuplicate: false });
        }
      });

      // Mark similar addresses
      for (let i = 0; i < uniqueRecords.length; i++) {
        for (let j = i + 1; j < uniqueRecords.length; j++) {
          const record1 = uniqueRecords[i];
          const record2 = uniqueRecords[j];

          if (record1.companyName.toLowerCase() === record2.companyName.toLowerCase() &&
              !record1.isDuplicate && !record2.isDuplicate &&
              record1.address1 && record2.address1) {

            const addr1 = record1.address1.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 15);
            const addr2 = record2.address1.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 15);

            if (addr1.length >= 3 && addr2.length >= 3) {
              const minLength = Math.min(addr1.length, addr2.length);
              let matches = 0;

              for (let k = 0; k < minLength; k++) {
                if (addr1[k] === addr2[k]) {
                  matches++;
                } else {
                  break;
                }
              }

              if ((matches / minLength) >= 0.8) {
                uniqueRecords[i].isSimilar = true;
                uniqueRecords[j].isSimilar = true;
              }
            }
          }
        }
      }

      uniqueRecords.sort((a, b) => {
        const nameCompare = a.companyName.localeCompare(b.companyName);
        if (nameCompare !== 0) return nameCompare;
        return a.address1.localeCompare(b.address1);
      });

      setProcessedData(uniqueRecords);
      
      const initialSelection = new Set();
      uniqueRecords.forEach((record, index) => {
        const hasCompleteAddress = record.address1 && record.city && record.state && record.zipCode;
        if ((!record.isDuplicate || record.isSelectableDuplicate) && hasCompleteAddress) {
          initialSelection.add(index);
        }
      });
      setSelectedRecords(initialSelection);
      
      setStep(STEPS.RESULTS);
      showSuccess(`Successfully processed ${uniqueRecords.length} records from ${files.length} file(s). Records with complete addresses have been pre-selected for export.`, 'Processing Complete');
    } catch (error) {
      console.error('Error processing files:', error);
      showError('An error occurred while processing the files. Please try again.');
    }
  }, [files, columnMappings, primaryFileIndex, showSuccess, showError]);

  const standardizeRecords = async (indices) => {
    setIsStandardizing(true);
    setStandardizationProgress({ current: 0, total: indices.length });
    
    try {
      const updatedData = [...processedData];
      
      for (let i = 0; i < indices.length; i++) {
        const recordIndex = indices[i];
        const record = updatedData[recordIndex];
        if (!record) continue;

        setStandardizationProgress({ current: i + 1, total: indices.length });

        const fullAddressParts = [record.address1, record.address2, record.city, record.state, record.zipCode].filter(Boolean);
        const fullAddress = fullAddressParts.join(', ');

        const standardized = fullAddress.trim() 
          ? await standardizeWithGemini(record.companyName, fullAddress)
          : {
              companyName: record.companyName.replace(/\b\w/g, l => l.toUpperCase()).trim(),
              address1: '', address2: '', city: '', state: '', zipCode: ''
            };

        updatedData[recordIndex] = { 
          ...record, 
          ...standardized, 
          isStandardized: true,
          originalData: {
            companyName: record.companyName,
            address1: record.address1,
            address2: record.address2,
            city: record.city,
            state: record.state,
            zipCode: record.zipCode
          }
        };
      }

      setProcessedData(updatedData);
      
      const recordCount = indices.length;
      showSuccess(
        recordCount === processedData.length 
          ? `Successfully standardized all ${recordCount} records.`
          : `Successfully standardized ${recordCount} record${recordCount !== 1 ? 's' : ''}.`,
        'Standardization Complete'
      );
      
    } catch (error) {
      console.error('Error standardizing records:', error);
      showError('An error occurred while standardizing the records. Please try again.');
    } finally {
      setIsStandardizing(false);
      setStandardizationProgress({ current: 0, total: 0 });
    }
  };

  const standardizeSelectedRecords = useCallback(async () => {
    if (selectedRecords.size === 0) {
      showWarning('Please select at least one record to standardize.');
      return;
    }
    await standardizeRecords(Array.from(selectedRecords));
  }, [selectedRecords, processedData, showWarning]);

  const standardizeAllRecords = useCallback(async () => {
    const allIndices = processedData.map((_, index) => index);
    const oldSelectedRecords = selectedRecords;
    setSelectedRecords(new Set(allIndices));
    
    try {
      await standardizeRecords(allIndices);
    } finally {
      setSelectedRecords(oldSelectedRecords);
    }
  }, [processedData, selectedRecords]);

  const toggleRecordSelection = useCallback((recordIndex) => {
    setSelectedRecords(prev => {
      const newSelected = new Set(prev);
      if (newSelected.has(recordIndex)) {
        newSelected.delete(recordIndex);
      } else {
        newSelected.add(recordIndex);
      }
      return newSelected;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    const visibleSelectableIndices = filteredData
      .filter(record => !record.isDuplicate || record.isSelectableDuplicate)
      .map(record => processedData.indexOf(record))
      .filter(index => index !== -1);

    const allVisibleSelected = visibleSelectableIndices.every(index => selectedRecords.has(index));
    
    setSelectedRecords(prev => {
      const newSelected = new Set(prev);
      if (allVisibleSelected) {
        visibleSelectableIndices.forEach(index => newSelected.delete(index));
      } else {
        visibleSelectableIndices.forEach(index => newSelected.add(index));
      }
      return newSelected;
    });
  }, [filteredData, processedData, selectedRecords]);

  const handleCellEdit = useCallback((recordIndex, field, value) => {
    setProcessedData(prev => {
      const updated = [...prev];
      updated[recordIndex] = { ...updated[recordIndex], [field]: value };
      return updated;
    });
  }, []);

  const handleCellClick = useCallback((recordIndex, field) => {
    setEditingCell({ recordIndex, field });
  }, []);

  const handleCellBlur = useCallback(() => {
    setEditingCell(null);
  }, []);

  const viewOriginalData = useCallback((record) => {
    setSelectedOriginalRecord(record);
    setShowOriginalModal(true);
  }, []);

  const closeOriginalModal = useCallback(() => {
    setShowOriginalModal(false);
    setSelectedOriginalRecord(null);
  }, []);

  const exportToCSV = useCallback(() => {
    try {
      const selectedData = processedData.filter((record, index) => selectedRecords.has(index));
      let finalExportData = [...selectedData];
      
      if (!showMissingAddresses) {
        finalExportData = finalExportData.filter(record => record.address1 && record.city && record.state && record.zipCode);
      }
      if (!showDuplicates) {
        finalExportData = finalExportData.filter(record => !record.isDuplicate || record.isSelectableDuplicate);
      }

      const companyGroups = new Map();
      finalExportData.forEach(record => {
        const companyKey = record.companyName.toLowerCase().trim();
        if (!companyGroups.has(companyKey)) {
          companyGroups.set(companyKey, []);
        }
        companyGroups.get(companyKey).push(record);
      });

      const customerNames = [];
      const customerLocations = [];

      companyGroups.forEach(recordGroup => {
        const sortedRecords = recordGroup.sort((a, b) => {
          const addressA = `${a.address1} ${a.city} ${a.state} ${a.zipCode}`.toLowerCase();
          const addressB = `${b.address1} ${b.city} ${b.state} ${b.zipCode}`.toLowerCase();
          return addressA.localeCompare(addressB);
        });

        if (sortedRecords.length > 0) customerNames.push(sortedRecords[0]);
        if (sortedRecords.length > 1) customerLocations.push(...sortedRecords.slice(1));
      });

      const headers = ['Customer Name', 'Address 1', 'Address 2', 'City', 'State', 'Zip Code'];
      const formatRecord = (record) => [
        `"${record.companyName.replace(/"/g, '""')}"`,
        `"${record.address1.replace(/"/g, '""')}"`,
        `"${record.address2.replace(/"/g, '""')}"`,
        `"${record.city.replace(/"/g, '""')}"`,
        `"${record.state.replace(/"/g, '""')}"`,
        `"${record.zipCode.replace(/"/g, '""')}"`
      ].join(',');

      const downloadCSV = (content, filename) => {
        const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
      };

      const customerNamesContent = [headers.join(','), ...customerNames.map(formatRecord)].join('\n');
      const customerLocationsContent = [headers.join(','), ...customerLocations.map(formatRecord)].join('\n');

      downloadCSV(customerNamesContent, 'Customer Names.csv');
      if (customerLocations.length > 0) {
        downloadCSV(customerLocationsContent, 'Customer Locations.csv');
      }

      showSuccess(
        `Downloaded ${customerNames.length} customer names${customerLocations.length > 0 ? ` and ${customerLocations.length} additional locations` : ''}.`,
        'Export Complete'
      );
    } catch (error) {
      console.error('Error exporting data:', error);
      showError('An error occurred while exporting the data. Please try again.');
    }
  }, [processedData, selectedRecords, showMissingAddresses, showDuplicates, showSuccess, showError]);

  const resetAll = useCallback(() => {
    setStep(STEPS.UPLOAD);
    setFiles([]);
    setFilesWithWorksheets([]);
    setProcessedData([]);
    setColumnMappings({});
    setSelectedRecords(new Set());
    setEditingCell(null);
    setPrimaryFileIndex(0);
    setShowMissingAddresses(true);
    setShowDuplicates(true);
    setIsStandardizing(false);
    setStandardizationProgress({ current: 0, total: 0 });
    setMappingName('');
    setShowOriginalModal(false);
    setSelectedOriginalRecord(null);
    showInfo('Application has been reset. You can now upload new files.', 'Reset Complete');
  }, [showInfo]);

  return {
    files, filesWithWorksheets, processedData, columnMappings, primaryFileIndex, showMissingAddresses, showDuplicates,
    selectedRecords, editingCell, step, isStandardizing, standardizationProgress, mappingName,
    showOriginalModal, selectedOriginalRecord, notifications,
    setShowMissingAddresses, setShowDuplicates, setPrimaryFileIndex, setMappingName, removeNotification,
    handleFileUpload, handleWorksheetSelection, handleContinueFromWorksheetSelection, updateColumnMapping, processFiles, standardizeSelectedRecords, 
    standardizeAllRecords, toggleRecordSelection, toggleSelectAll, handleCellEdit, 
    handleCellClick, handleCellBlur, exportToCSV, resetAll, exportMapping, importMapping,
    viewOriginalData, closeOriginalModal,
    filteredData, selectedCount
  };
};

const CustomerExtractor = () => {
  const {
    // State
    files,
    filesWithWorksheets,
    processedData,
    columnMappings,
    primaryFileIndex,
    showMissingAddresses,
    showDuplicates,
    selectedRecords,
    editingCell,
    step,
    isStandardizing,
    standardizationProgress,
    mappingName,
    showOriginalModal,
    selectedOriginalRecord,
    notifications,
    
    // Actions
    handleFileUpload,
    handleWorksheetSelection,
    handleContinueFromWorksheetSelection,
    updateColumnMapping,
    setPrimaryFileIndex,
    setShowMissingAddresses,
    setShowDuplicates,
    setMappingName,
    toggleRecordSelection,
    toggleSelectAll,
    handleCellEdit,
    handleCellClick,
    handleCellBlur,
    processFiles,
    standardizeSelectedRecords,
    standardizeAllRecords,
    exportToCSV,
    resetAll,
    exportMapping,
    importMapping,
    viewOriginalData,
    closeOriginalModal,
    removeNotification,
    
    // Computed
    filteredData,
    selectedCount
  } = useCustomerExtractor();

  return (
    <div className="max-w-7xl mx-auto p-6 bg-gray-50 min-h-screen">
      <SnackbarContainer notifications={notifications} onRemove={removeNotification} />
      
      <div className="bg-white rounded-lg shadow-lg p-6">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-800 flex items-center gap-2">
            <FileText className="text-blue-600" />
            ForgeOS - Onboarding
          </h1>
        </header>

        <StepIndicator currentStep={step} />

        {isStandardizing && (
          <ProgressIndicator 
            current={standardizationProgress.current}
            total={standardizationProgress.total}
          />
        )}

        {step === STEPS.UPLOAD && (
          <FileUploadStep onFileUpload={handleFileUpload} />
        )}

        {step === STEPS.WORKSHEET_SELECTION && (
          <WorksheetSelectionStep
            filesWithWorksheets={filesWithWorksheets}
            onWorksheetSelection={handleWorksheetSelection}
            onContinue={handleContinueFromWorksheetSelection}
          />
        )}

        {step === STEPS.MAPPING && (
          <ColumnMappingStep
            files={files}
            columnMappings={columnMappings}
            primaryFileIndex={primaryFileIndex}
            mappingName={mappingName}
            onUpdateMapping={updateColumnMapping}
            onSetPrimaryFile={setPrimaryFileIndex}
            onProcessFiles={processFiles}
            onSetMappingName={setMappingName}
            onExportMapping={exportMapping}
            onImportMapping={importMapping}
          />
        )}

        {step === STEPS.RESULTS && (
          <ResultsStep
            processedData={processedData}
            filteredData={filteredData}
            selectedRecords={selectedRecords}
            selectedCount={selectedCount}
            showMissingAddresses={showMissingAddresses}
            showDuplicates={showDuplicates}
            editingCell={editingCell}
            isStandardizing={isStandardizing}
            files={files}
            primaryFileIndex={primaryFileIndex}
            onToggleRecordSelection={toggleRecordSelection}
            onToggleSelectAll={toggleSelectAll}
            onCellEdit={handleCellEdit}
            onCellClick={handleCellClick}
            onCellBlur={handleCellBlur}
            onToggleMissingAddresses={() => setShowMissingAddresses(!showMissingAddresses)}
            onToggleDuplicates={() => setShowDuplicates(!showDuplicates)}
            onStandardizeSelected={standardizeSelectedRecords}
            onStandardizeAll={standardizeAllRecords}
            onExport={exportToCSV}
            onReset={resetAll}
            onViewOriginalData={viewOriginalData}
          />
        )}
      </div>

      <OriginalDataModal
        isOpen={showOriginalModal}
        record={selectedOriginalRecord}
        onClose={closeOriginalModal}
      />
    </div>
  );
};

export default CustomerExtractor;