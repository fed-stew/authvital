import * as React from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DropdownOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface DropdownProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onChange'> {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

function Dropdown({
  value,
  onChange,
  options,
  placeholder = 'Select an option',
  disabled = false,
  className,
  ...props
}: DropdownProps) {
  const [isOpen, setIsOpen] = React.useState(false);
  const dropdownRef = React.useRef<HTMLDivElement>(null);
  const triggerRef = React.useRef<HTMLButtonElement>(null);

  const selectedOption = React.useMemo(
    () => options.find((opt) => opt.value === value),
    [value, options]
  );

  // Close dropdown when clicking outside
  React.useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  // Handle escape key
  React.useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen]);

  const handleSelect = (optionValue: string) => {
    if (disabled) return;
    onChange(optionValue);
    setIsOpen(false);
  };

  const triggerLabel = selectedOption?.label || placeholder;

  return (
    <div
      ref={dropdownRef}
      className={cn('relative w-full', className)}
      {...props}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        className={cn(
          'flex w-full items-center justify-between rounded-md border border-white/20 bg-card px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground transition-colors',
          'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
          'disabled:pointer-events-none disabled:opacity-50',
          isOpen && 'ring-2 ring-ring ring-offset-2'
        )}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-disabled={disabled}
      >
        <span className={cn(!selectedOption && 'text-muted-foreground')}>
          {triggerLabel}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 shrink-0 transition-transform',
            isOpen && 'rotate-180'
          )}
        />
      </button>

      {isOpen && (
        <ul
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-white/10 bg-card shadow-lg',
            'animate-in fade-in slide-in-from-top-1 duration-200'
          )}
        >
          {options.map((option) => {
            const isSelected = option.value === value;
            return (
              <li
                key={option.value}
                role="option"
                aria-selected={isSelected}
                className={cn(
                  'flex cursor-pointer items-center justify-between px-3 py-2 text-sm transition-colors',
                  option.disabled
                    ? 'pointer-events-none opacity-50'
                    : 'hover:bg-white/5 focus:bg-white/5 focus:outline-none',
                  isSelected && 'bg-white/10'
                )}
                onClick={() => handleSelect(option.value)}
              >
                <span className={isSelected ? 'font-medium' : ''}>
                  {option.label}
                </span>
                {isSelected && <Check className="h-4 w-4" />}
              </li>
            );
          })}
          {options.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted-foreground">
              No options available
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

export { Dropdown };
