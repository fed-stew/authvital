import * as React from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui';

// =============================================================================
// TYPES
// =============================================================================

export interface WebhookEvent {
  type: string;
  description: string;
}

export interface EventCategory {
  slug: string;
  name: string;
  description: string;
  events: WebhookEvent[];
}

interface WebhookEventPickerProps {
  value: string[];  // Empty array = all events, non-empty = selected events
  onChange: (events: string[]) => void;
  categories: EventCategory[];
}

type CategoryState = 'all' | 'some' | 'none';

// =============================================================================
// COMPONENT
// =============================================================================

export function WebhookEventPicker({ value, onChange, categories }: WebhookEventPickerProps) {
  const [expandedCategories, setExpandedCategories] = React.useState<Set<string>>(new Set());
  
  // Track if user has explicitly chosen "selected" mode but hasn't selected events yet
  // This handles the edge case where value=[] could mean "all" or "selected but empty"
  const [forceSelectedMode, setForceSelectedMode] = React.useState(false);
  
  // Determine mode: if value has items, definitely "selected"
  // If value is empty, check if user forced into selected mode
  const mode = value.length > 0 || forceSelectedMode ? 'selected' : 'all';

  // Expand selected events from wildcards to individual events for UI state
  const expandedSelection = React.useMemo(() => {
    const selected = new Set<string>();
    for (const v of value) {
      if (v.endsWith('.*')) {
        // Wildcard - expand to all events in category
        const categorySlug = v.slice(0, -2);
        const category = categories.find(c => c.slug === categorySlug);
        if (category) {
          category.events.forEach(e => selected.add(e.type));
        }
      } else {
        selected.add(v);
      }
    }
    return selected;
  }, [value, categories]);

  // Handle mode change
  const handleModeChange = (newMode: 'all' | 'selected') => {
    if (newMode === 'all') {
      setForceSelectedMode(false);
      onChange([]);  // Empty = all events
    } else {
      // Switching to 'selected' mode - set flag to show picker even with empty value
      setForceSelectedMode(true);
    }
  };

  // Check category state (all, some, none)
  const getCategoryState = React.useCallback((category: EventCategory): CategoryState => {
    const selectedCount = category.events.filter(e => expandedSelection.has(e.type)).length;
    if (selectedCount === 0) return 'none';
    if (selectedCount === category.events.length) return 'all';
    return 'some';
  }, [expandedSelection]);

  // Convert selection to optimized format (use wildcards when all events selected)
  const emitChange = React.useCallback((selection: Set<string>) => {
    const result: string[] = [];
    
    for (const category of categories) {
      const categoryEvents = category.events.map(e => e.type);
      const selectedInCategory = categoryEvents.filter(e => selection.has(e));
      
      if (selectedInCategory.length === categoryEvents.length) {
        // All selected - use wildcard
        result.push(`${category.slug}.*`);
      } else {
        // Partial selection - use individual events
        result.push(...selectedInCategory);
      }
    }
    
    // If result is empty but we're in selected mode, keep the force flag on
    // to prevent flipping back to "all" mode
    if (result.length === 0) {
      setForceSelectedMode(true);
    } else {
      // If user selects something, we can clear the force flag (value will keep us in selected mode)
      setForceSelectedMode(false);
    }
    onChange(result);
  }, [categories, onChange]);

  // Toggle category expansion
  const toggleExpanded = React.useCallback((slug: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  }, []);

  // Toggle all events in a category
  const toggleCategory = React.useCallback((category: EventCategory) => {
    const state = getCategoryState(category);
    const newSelection = new Set(expandedSelection);
    
    if (state === 'all') {
      // Deselect all in category
      category.events.forEach(e => newSelection.delete(e.type));
    } else {
      // Select all in category
      category.events.forEach(e => newSelection.add(e.type));
    }
    
    emitChange(newSelection);
  }, [getCategoryState, expandedSelection, emitChange]);

  // Toggle individual event
  const toggleEvent = React.useCallback((eventType: string) => {
    const newSelection = new Set(expandedSelection);
    if (newSelection.has(eventType)) {
      newSelection.delete(eventType);
    } else {
      newSelection.add(eventType);
    }
    emitChange(newSelection);
  }, [expandedSelection, emitChange]);

  // Auto-expand categories that have some (but not all) events selected on mount
  React.useEffect(() => {
    const toExpand = new Set<string>();
    for (const category of categories) {
      const state = getCategoryState(category);
      if (state === 'some') {
        toExpand.add(category.slug);
      }
    }
    if (toExpand.size > 0) {
      setExpandedCategories(prev => new Set([...prev, ...toExpand]));
    }
  // Only on mount (empty deps since we want this once)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-4">
      {/* Mode Selection */}
      <div className="space-y-3">
        {/* All Events Option */}
        <label 
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            mode === 'all' 
              ? 'border-primary bg-primary/10' 
              : 'border-white/10 hover:border-white/20'
          }`}
          onClick={() => handleModeChange('all')}
        >
          <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
            mode === 'all' ? 'border-primary' : 'border-white/30'
          }`}>
            {mode === 'all' && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <div>
            <div className="font-medium">All Events</div>
            <div className="text-sm text-muted-foreground">
              Receive all event types, including any new events added in the future.
            </div>
          </div>
        </label>

        {/* Selected Events Option */}
        <label 
          className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
            mode === 'selected' 
              ? 'border-primary bg-primary/10' 
              : 'border-white/10 hover:border-white/20'
          }`}
          onClick={() => handleModeChange('selected')}
        >
          <div className={`mt-0.5 h-4 w-4 rounded-full border-2 flex items-center justify-center ${
            mode === 'selected' ? 'border-primary' : 'border-white/30'
          }`}>
            {mode === 'selected' && <div className="h-2 w-2 rounded-full bg-primary" />}
          </div>
          <div>
            <div className="font-medium">Selected Events Only</div>
            <div className="text-sm text-muted-foreground">
              Choose specific events to receive.
            </div>
          </div>
        </label>
      </div>

      {/* Event Picker - Only shown when mode is 'selected' */}
      {mode === 'selected' && (
        <>
          {/* Warning when no events selected */}
          {expandedSelection.size === 0 && (
            <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg text-sm text-yellow-400">
              ⚠️ No events selected. Webhooks will not fire until you select at least one event.
            </div>
          )}
          
          <div className="border border-white/10 rounded-lg overflow-hidden">
            {categories.map((category) => {
              const state = getCategoryState(category);
              const isExpanded = expandedCategories.has(category.slug);
              const selectedInCategory = category.events.filter(e => expandedSelection.has(e.type)).length;
              
              return (
                <div key={category.slug} className="border-b border-white/10 last:border-b-0">
                  {/* Category Header */}
                  <div 
                    className="flex items-center gap-3 px-4 py-3 bg-white/5 hover:bg-white/10 cursor-pointer transition-colors"
                    onClick={() => toggleExpanded(category.slug)}
                  >
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                    )}
                    
                    <Checkbox
                      checked={state === 'all'}
                      indeterminate={state === 'some'}
                      onCheckedChange={() => toggleCategory(category)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    
                    <div className="flex-1 min-w-0">
                      <span className="font-medium">{category.name}</span>
                      <span className="ml-2 text-xs text-muted-foreground">
                        ({selectedInCategory}/{category.events.length})
                      </span>
                    </div>
                    
                    <span className={`text-xs px-2 py-0.5 rounded flex-shrink-0 ${
                      state === 'all' ? 'bg-green-500/20 text-green-400' :
                      state === 'some' ? 'bg-yellow-500/20 text-yellow-400' :
                      'bg-white/10 text-muted-foreground'
                    }`}>
                      {state === 'all' ? 'All' : state === 'some' ? 'Some' : 'None'}
                    </span>
                  </div>
                  
                  {/* Events List */}
                  {isExpanded && (
                    <div className="bg-background">
                      {category.events.map((event) => (
                        <div
                          key={event.type}
                          className="flex items-center gap-3 px-4 py-2 pl-12 hover:bg-white/5 cursor-pointer transition-colors"
                          onClick={() => toggleEvent(event.type)}
                        >
                          <Checkbox
                            checked={expandedSelection.has(event.type)}
                            onCheckedChange={() => toggleEvent(event.type)}
                            onClick={(e) => e.stopPropagation()}
                          />
                          <div className="flex-1 min-w-0">
                            <code className="text-sm text-foreground">{event.type}</code>
                            <p className="text-xs text-muted-foreground">{event.description}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
