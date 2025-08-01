"use client"

import React, { useState } from "react"
import { cn } from "@/lib/utils"

interface TooltipProviderProps {
  children: React.ReactNode
}

const TooltipProvider = ({ children }: TooltipProviderProps) => {
  return <>{children}</>
}

interface TooltipProps {
  children: React.ReactNode
}

const Tooltip = ({ children }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false)
  
  const handleMouseEnter = () => {
    setIsVisible(true)
  }
  
  const handleMouseLeave = () => {
    setIsVisible(false)
  }
  
  return (
    <div 
      className="relative inline-block w-full"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {React.Children.map(children, (child) => {
        if (React.isValidElement(child)) {
          if (child.type === TooltipContent) {
            return React.cloneElement(child, { 
              ...child.props, 
              isVisible,
              onMouseEnter: handleMouseEnter,
              onMouseLeave: handleMouseLeave
            } as any)
          }
        }
        return child
      })}
    </div>
  )
}

interface TooltipTriggerProps {
  asChild?: boolean
  children: React.ReactNode
  className?: string
}

const TooltipTrigger = React.forwardRef<
  HTMLDivElement,
  TooltipTriggerProps
>(({ children, asChild, className, ...props }, ref) => {
  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children, {
      ...children.props,
      className: cn(children.props.className, className),
      ref
    })
  }
  return (
    <div ref={ref} className={className} {...props}>
      {children}
    </div>
  )
})
TooltipTrigger.displayName = "TooltipTrigger"

interface TooltipContentProps extends React.HTMLAttributes<HTMLDivElement> {
  isVisible?: boolean
  children: React.ReactNode
}

const TooltipContent = React.forwardRef<
  HTMLDivElement,
  TooltipContentProps
>(({ children, className, isVisible = false, onMouseEnter, onMouseLeave, ...props }, ref) => {
  if (!isVisible) return null
  
  return (
    <div
      ref={ref}
      className={cn(
        "absolute z-[60] min-w-[320px] max-w-lg overflow-visible rounded-lg border bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 p-4 text-sm text-gray-900 dark:text-gray-100 shadow-xl",
        "left-full ml-3 top-0 pointer-events-none",
        className
      )}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      {...props}
    >
      {children}
    </div>
  )
})
TooltipContent.displayName = "TooltipContent"

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider }