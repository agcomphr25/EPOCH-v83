      {/* Simple Working Modal - Replace the broken dialog */}
      {showShippingDialog && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              {/* Header */}
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold">Shipping Details for Order {selectedOrderId}</h2>
                <button
                  onClick={() => setShowShippingDialog(false)}
                  className="text-gray-400 hover:text-gray-600 text-2xl"
                >
                  ×
                </button>
              </div>
              
              {/* Package Details */}
              <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold">Package Details</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Weight (lbs)</label>
                    <input
                      type="number"
                      value={shippingDetails.weight}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, weight: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Declared Value ($)</label>
                    <input
                      type="number"
                      value={shippingDetails.value}
                      onChange={(e) => setShippingDetails(prev => ({ ...prev, value: e.target.value }))}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md"
                      placeholder="500"
                    />
                  </div>
                </div>
              </div>
              
              {/* Billing Options */}
              <div className="space-y-4 mb-6">
                <h3 className="text-lg font-semibold">Billing Options</h3>
                <div className="space-y-2">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="billing"
                      checked={shippingDetails.billingOption === 'sender'}
                      onChange={() => setShippingDetails(prev => ({ ...prev, billingOption: 'sender' }))}
                      className="mr-2"
                    />
                    Bill to Sender (Our Account)
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="billing"
                      checked={shippingDetails.billingOption === 'receiver'}
                      onChange={() => setShippingDetails(prev => ({ ...prev, billingOption: 'receiver' }))}
                      className="mr-2"
                    />
                    Bill to Receiver
                  </label>
                </div>
                
                {shippingDetails.billingOption === 'receiver' && (
                  <div className="ml-6 space-y-3 p-4 bg-blue-50 rounded-lg">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">UPS Account Number</label>
                        <input
                          type="text"
                          value={shippingDetails.receiverAccount.accountNumber}
                          onChange={(e) => setShippingDetails(prev => ({ 
                            ...prev, 
                            receiverAccount: { ...prev.receiverAccount, accountNumber: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="Enter UPS account number"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-1">ZIP Code</label>
                        <input
                          type="text"
                          value={shippingDetails.receiverAccount.zipCode}
                          onChange={(e) => setShippingDetails(prev => ({ 
                            ...prev, 
                            receiverAccount: { ...prev.receiverAccount, zipCode: e.target.value }
                          }))}
                          className="w-full px-3 py-2 border border-gray-300 rounded-md"
                          placeholder="12345"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
              
              {/* Action Buttons */}
              <div className="flex gap-3">
                <button
                  onClick={() => setShowShippingDialog(false)}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={generateShippingLabel}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Generate Label
                </button>
              </div>
            </div>
          </div>
        </div>
      )}