import React from 'react';
import { scheduleLOPAdjustments, identifyLOPOrders, getLOPStatus, needsImmediateLOPAttention } from '../utils/lopScheduler';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Zap } from 'lucide-react';
import { getDisplayOrderId } from '@/lib/orderUtils';

interface LOPManagerProps {
  orders: any[];
}

export default function LOPManager({ orders }: LOPManagerProps) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Zap className="w-4 h-4 mr-2" />
          LOP Manager
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Length of Pull (LOP) Adjustment Manager</DialogTitle>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Manage LOP adjustments scheduled for Mondays or priority escalations
          </p>
        </DialogHeader>
        
        <div className="space-y-6">
          {/* LOP Status Overview */}
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <h3 className="font-medium mb-2">LOP Scheduling Rules</h3>
            <ul className="text-sm space-y-1">
              <li>• LOP adjustments are scheduled for Mondays</li>
              <li>• Priority escalations trigger immediate scheduling</li>
              <li>• Orders requiring LOP adjustment show status badges</li>
              <li>• Monday scheduling ensures consistent weekly reviews</li>
            </ul>
          </div>

          {/* Orders Requiring LOP Attention */}
          <div>
            <h3 className="font-medium mb-3">Orders Requiring LOP Attention</h3>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {(() => {
                const lopOrders = identifyLOPOrders(orders).filter(order => order.needsLOPAdjustment);
                
                if (lopOrders.length === 0) {
                  return (
                    <div className="text-center py-8 text-gray-500">
                      No orders currently require LOP adjustments
                    </div>
                  );
                }

                return lopOrders.map(order => {
                  const lopStatus = getLOPStatus(order);
                  const immediateAttention = needsImmediateLOPAttention(order);
                  
                  return (
                    <div 
                      key={order.orderId} 
                      className={`p-3 border rounded-lg ${
                        immediateAttention 
                          ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' 
                          : 'bg-gray-50 dark:bg-gray-800'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="font-medium">
                            {getDisplayOrderId(order.orderId)} - {order.customer}
                          </div>
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {order.product} | Priority: {order.priority}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {lopStatus.message}
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${
                            lopStatus.status === 'immediate' 
                              ? 'bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-300'
                              : lopStatus.status === 'scheduled'
                              ? 'bg-orange-100 dark:bg-orange-900/50 text-orange-700 dark:text-orange-300'
                              : 'bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-300'
                          }`}>
                            {lopStatus.status.toUpperCase()}
                          </span>
                          
                          {immediateAttention && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                            >
                              Process Now
                            </Button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                });
              })()}
            </div>
          </div>

          {/* Manual LOP Scheduling */}
          <div className="p-4 border-2 border-dashed border-gray-300 rounded-lg">
            <div className="flex items-center mb-3">
              <Zap className="w-4 h-4 mr-2" />
              <span className="font-medium">Manual LOP Scheduling</span>
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <Button 
                onClick={() => {
                  const updatedOrders = scheduleLOPAdjustments(identifyLOPOrders(orders));
                  console.log('Manual LOP scheduling triggered for', updatedOrders.length, 'orders');
                }}
                className="bg-blue-600 hover:bg-blue-700"
              >
                Run LOP Scheduler
              </Button>
              
              <Button 
                variant="outline"
                onClick={() => {
                  const today = new Date();
                  const isMonday = today.getDay() === 1;
                  if (isMonday) {
                    console.log('Today is Monday - running immediate LOP scheduling');
                  } else {
                    console.log('Not Monday - scheduling deferred until next Monday');
                  }
                }}
              >
                Check Monday Status
              </Button>
            </div>
            
            <p className="text-xs text-gray-600 dark:text-gray-400 mt-2">
              Manual scheduling will apply LOP rules to all eligible orders
            </p>
          </div>
          
          {/* LOP Statistics */}
          <div className="grid grid-cols-3 gap-4">
            {(() => {
              const lopOrders = identifyLOPOrders(orders);
              const needingLOP = lopOrders.filter(o => o.needsLOPAdjustment);
              const immediate = needingLOP.filter(o => needsImmediateLOPAttention(o));
              const scheduled = needingLOP.filter(o => o.scheduledLOPAdjustmentDate);
              
              return (
                <>
                  <div className="text-center p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="text-2xl font-bold text-gray-900 dark:text-gray-100">
                      {needingLOP.length}
                    </div>
                    <div className="text-sm text-gray-600 dark:text-gray-400">
                      Need LOP Adjustment
                    </div>
                  </div>
                  
                  <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                      {immediate.length}
                    </div>
                    <div className="text-sm text-red-600 dark:text-red-400">
                      Immediate Attention
                    </div>
                  </div>
                  
                  <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600 dark:text-orange-400">
                      {scheduled.length}
                    </div>
                    <div className="text-sm text-orange-600 dark:text-orange-400">
                      Scheduled
                    </div>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}