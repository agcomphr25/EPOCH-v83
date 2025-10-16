import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Bell, Mail, X } from 'lucide-react';

interface UnreadCountResponse {
  userId: number;
  unreadCount: number;
  hasUnread: boolean;
}

interface CurrentUser {
  id: number;
  username: string;
  role: string;
}

export default function MessageNotificationPopup() {
  const [, navigate] = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [hasBeenShown, setHasBeenShown] = useState(false);

  // Get current user
  const { data: currentUser } = useQuery<CurrentUser>({
    queryKey: ['/api/auth/session'],
  });

  // Get unread message count
  const { data: unreadData, isLoading } = useQuery<UnreadCountResponse>({
    queryKey: [`/api/internal-messages/unread/count/${currentUser?.id}`],
    enabled: !!currentUser?.id,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  // Reset hasBeenShown flag when user changes (logout/login)
  useEffect(() => {
    if (currentUser?.id) {
      setHasBeenShown(false);
    }
  }, [currentUser?.id]);

  // Show popup on login when user has unread messages
  useEffect(() => {
    if (
      !isLoading &&
      unreadData &&
      unreadData.hasUnread &&
      !hasBeenShown &&
      currentUser?.id
    ) {
      setIsOpen(true);
      setHasBeenShown(true);
    }
  }, [unreadData, isLoading, hasBeenShown, currentUser]);

  const handleViewMessages = () => {
    setIsOpen(false);
    navigate('/communication');
  };

  const handleDismiss = () => {
    setIsOpen(false);
  };

  if (!unreadData || !unreadData.hasUnread) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent
        className="sm:max-w-md"
        data-testid="dialog-message-notification"
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-blue-500 animate-bounce" />
            New Messages
          </DialogTitle>
          <DialogDescription>
            You have {unreadData.unreadCount} unread{' '}
            {unreadData.unreadCount === 1 ? 'message' : 'messages'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start gap-3">
            <Mail className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">Unread Messages</p>
              <p className="text-sm text-blue-700 mt-1">
                {unreadData.unreadCount === 1
                  ? 'You have 1 unread message waiting for you.'
                  : `You have ${unreadData.unreadCount} unread messages waiting for you.`}
              </p>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button
              variant="outline"
              onClick={handleDismiss}
              data-testid="button-dismiss-notification"
            >
              <X className="h-4 w-4 mr-2" />
              Dismiss
            </Button>
            <Button
              onClick={handleViewMessages}
              data-testid="button-view-messages"
            >
              <Mail className="h-4 w-4 mr-2" />
              View Messages
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
