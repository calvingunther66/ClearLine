import React, { useState } from 'react';
import type { Constraint } from '../core/types';

interface ConstraintsPanelProps {
  constraints: Constraint[];
  onConstraintsChange: (constraints: Constraint[]) => void;
}

export const ConstraintsPanel: React.FC<ConstraintsPanelProps> = ({ constraints, onConstraintsChange }) => {
  const [isOpen, setIsOpen] = useState(true);

  const addConstraint = () => {
    const newConstraint: Constraint = {
      id: Math.random().toString(36).substr(2, 9),
      metric: 'education',
      metricType: 'value',
      operator: '>',
      value: 50,
      targetPercent: 50
    };
    onConstraintsChange([...constraints, newConstraint]);
  };

  const removeConstraint = (id: string) => {
    onConstraintsChange(constraints.filter(c => c.id !== id));
  };

  const updateConstraint = (id: string, updates: Partial<Constraint>) => {
    onConstraintsChange(constraints.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  return (
    <div className="absolute top-4 right-4 bg-slate-900/90 backdrop-blur-md border border-slate-700 rounded-lg p-4 w-96 shadow-xl z-20">
      <div className="flex justify-between items-center mb-4 cursor-pointer" onClick={() => setIsOpen(!isOpen)}>
        <h2 className="text-sm font-bold text-slate-100 uppercase tracking-widest flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-purple-500 animate-pulse"></span>
          Constraints
        </h2>
        <span className="text-slate-400 text-xs">{isOpen ? '▼' : '▶'}</span>
      </div>

      {isOpen && (
        <div className="space-y-4">
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {constraints.map(c => (
              <div key={c.id} className="bg-slate-800/50 p-2 rounded border border-slate-700 text-xs flex flex-col gap-2">
                <div className="flex gap-2 items-center">
                  <select 
                    value={c.metricType || 'value'}
                    onChange={(e) => updateConstraint(c.id, { metricType: e.target.value as 'value' | 'growth' })}
                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 w-20 text-xs"
                  >
                    <option value="value">Value</option>
                    <option value="growth">Growth</option>
                  </select>
                  <select 
                    value={c.metric}
                    onChange={(e) => updateConstraint(c.id, { metric: e.target.value as Constraint['metric'] })}
                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 flex-1"
                  >
                    <option value="population">Population</option>
                    <option value="demVotes">Dem Votes</option>
                    <option value="repVotes">Rep Votes</option>
                    <option value="white">White</option>
                    <option value="black">Black</option>
                    <option value="hispanic">Hispanic</option>
                    {(!c.metricType || c.metricType === 'value') && (
                      <>
                        <option value="education">BA+ %</option>
                        <option value="income">Income</option>
                      </>
                    )}
                  </select>
                  <select 
                    value={c.operator}
                    onChange={(e) => updateConstraint(c.id, { operator: e.target.value as Constraint['operator'] })}
                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 w-16"
                  >
                    <option value=">">&gt;</option>
                    <option value="<">&lt;</option>
                    <option value=">=">&ge;</option>
                    <option value="<=">&le;</option>
                    <option value="~=">~=</option>
                    <option value="between">Range</option>
                  </select>
                  <input 
                    type="number" 
                    value={c.value}
                    onChange={(e) => updateConstraint(c.id, { value: Number(e.target.value) })}
                    className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 w-16"
                    placeholder={c.operator === 'between' ? "Min" : "Value"}
                  />
                  {c.operator === 'between' && (
                    <input 
                      type="number" 
                      value={c.maxValue || c.value + 10}
                      onChange={(e) => updateConstraint(c.id, { maxValue: Number(e.target.value) })}
                      className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 w-16"
                      placeholder="Max"
                    />
                  )}
                </div>
                <div className="flex justify-between items-center">
                  <div className="flex items-center gap-2">
                    <span className="text-slate-400">Target:</span>
                    <input 
                      type="number" 
                      value={c.targetPercent}
                      onChange={(e) => updateConstraint(c.id, { targetPercent: Number(e.target.value) })}
                      className="bg-slate-900 border border-slate-700 rounded px-1 py-0.5 text-slate-300 w-12"
                    />
                    <span className="text-slate-400">% of districts</span>
                  </div>
                  <button 
                    onClick={() => removeConstraint(c.id)}
                    className="text-red-400 hover:text-red-300 px-2"
                  >
                    ×
                  </button>
                </div>
                {/* Natural Language Sentence */}
                <div className="text-[10px] text-slate-500 italic border-t border-slate-700/50 pt-1 mt-1">
                  In <strong className="text-purple-400">{c.targetPercent}%</strong> of districts, 
                  <strong className="text-blue-400"> {c.metricType === 'growth' ? `${c.metric} growth` : c.metric}</strong> should be 
                  <strong className="text-emerald-400"> {c.operator === 'between' ? `between ${c.value} and ${c.maxValue || c.value}` : `${c.operator} ${c.value}`}</strong>
                  {c.metricType === 'growth' && <span className="text-slate-500"> (avg YoY %)</span>}
                </div>
              </div>
            ))}
          </div>
          
          <button 
            onClick={addConstraint}
            className="w-full py-1.5 bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold rounded transition-colors"
          >
            + Add Constraint
          </button>
        </div>
      )}
    </div>
  );
};
