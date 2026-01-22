import { useState, useRef, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Type, Mail, Calendar, CheckSquare, List, PenLine, X } from 'lucide-react';

export interface NormalizedFieldDef {
  id: string;
  name: string;
  label: string;
  type: 'text' | 'email' | 'date' | 'checkbox' | 'select' | 'signature';
  required?: boolean;
  page: number;
  normalizedX: number;
  normalizedY: number;
  normalizedWidth: number;
  normalizedHeight: number;
  options?: string[];
}

interface FieldOverlayProps {
  field: NormalizedFieldDef;
  pageWidth: number;
  pageHeight: number;
  currentPage: number;
  isSelected: boolean;
  onSelect: () => void;
  onUpdate: (updates: Partial<NormalizedFieldDef>) => void;
  onDelete: () => void;
}

const fieldTypeIcons = {
  text: Type,
  email: Mail,
  date: Calendar,
  checkbox: CheckSquare,
  select: List,
  signature: PenLine,
};

const fieldTypeColors = {
  text: 'bg-blue-100 border-blue-400',
  email: 'bg-green-100 border-green-400',
  date: 'bg-purple-100 border-purple-400',
  checkbox: 'bg-orange-100 border-orange-400',
  select: 'bg-yellow-100 border-yellow-400',
  signature: 'bg-pink-100 border-pink-400',
};

export default function FieldOverlay({
  field,
  pageWidth,
  pageHeight,
  currentPage,
  isSelected,
  onSelect,
  onUpdate,
  onDelete,
}: FieldOverlayProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isResizing, setIsResizing] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  if (field.page !== currentPage - 1) return null;

  const x = field.normalizedX * pageWidth;
  const y = field.normalizedY * pageHeight;
  const width = field.normalizedWidth * pageWidth;
  const height = field.normalizedHeight * pageHeight;

  const Icon = fieldTypeIcons[field.type] || Type;

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setIsDragging(true);
    setDragStart({ x: e.clientX - x, y: e.clientY - y });
  };

  const handleResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onSelect();
    setIsResizing(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    if (!isDragging && !isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isDragging) {
        const newX = e.clientX - dragStart.x;
        const newY = e.clientY - dragStart.y;

        const clampedX = Math.max(0, Math.min(newX, pageWidth - width));
        const clampedY = Math.max(0, Math.min(newY, pageHeight - height));

        onUpdate({
          normalizedX: clampedX / pageWidth,
          normalizedY: clampedY / pageHeight,
        });
      } else if (isResizing) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;

        const newWidth = Math.max(50, width + deltaX);
        const newHeight = Math.max(20, height + deltaY);

        const clampedWidth = Math.min(newWidth, pageWidth - x);
        const clampedHeight = Math.min(newHeight, pageHeight - y);

        onUpdate({
          normalizedWidth: clampedWidth / pageWidth,
          normalizedHeight: clampedHeight / pageHeight,
        });

        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
      setIsResizing(false);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, isResizing, dragStart, pageWidth, pageHeight, x, y, width, height, onUpdate]);

  return (
    <div
      ref={overlayRef}
      className={cn(
        'absolute cursor-move border-2 rounded transition-shadow',
        fieldTypeColors[field.type],
        isSelected && 'ring-2 ring-blue-500 ring-offset-2 shadow-lg z-10'
      )}
      style={{
        left: x,
        top: y,
        width,
        height,
        minWidth: 50,
        minHeight: 20,
      }}
      onMouseDown={handleMouseDown}
    >
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <Icon className="w-4 h-4 mr-1 opacity-60" />
        <span className="text-xs font-medium truncate">{field.name}</span>
      </div>

      {isSelected && (
        <>
          <button
            className="absolute -top-2 -right-2 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center hover:bg-red-600 z-20"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <X className="w-3 h-3" />
          </button>
          <div
            className="absolute bottom-0 right-0 w-4 h-4 bg-blue-500 cursor-se-resize rounded-tl"
            onMouseDown={handleResizeMouseDown}
          />
        </>
      )}
    </div>
  );
}
