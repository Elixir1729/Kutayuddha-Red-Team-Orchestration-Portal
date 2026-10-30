import React, { useState, useCallback } from 'react';
import { Plus, X, Globe, Server, Cloud, ShieldOff } from 'lucide-react';
import { clsx } from 'clsx';
import { ScopeConfig } from '../../types';

interface ScopeEditorProps {
  value: ScopeConfig;
  onChange: (config: ScopeConfig) => void;
}

interface SectionConfig {
  key: keyof ScopeConfig;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  validate: (value: string) => string | null;
  pillColor: string;
}

const CIDR_REGEX = /^(\d{1,3}\.){3}\d{1,3}\/\d{1,2}$/;
const DOMAIN_REGEX = /^(\*\.)?([a-zA-Z0-9-]+\.)*[a-zA-Z]{2,}$/;

const SECTIONS: SectionConfig[] = [
  {
    key: 'cidrs',
    label: 'CIDR Ranges',
    placeholder: 'e.g. 10.0.0.0/8',
    icon: <Server className="w-4 h-4" />,
    validate: (val: string) => {
      if (!CIDR_REGEX.test(val)) return 'Invalid CIDR format (expected x.x.x.x/n)';
      const parts = val.split('/');
      const octets = parts[0].split('.').map(Number);
      const prefix = Number(parts[1]);
      if (octets.some((o) => o < 0 || o > 255)) return 'Invalid IP octets';
      if (prefix < 0 || prefix > 32) return 'CIDR prefix must be 0-32';
      return null;
    },
    pillColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
  },
  {
    key: 'domains',
    label: 'Domains',
    placeholder: 'e.g. corp.example.com',
    icon: <Globe className="w-4 h-4" />,
    validate: (val: string) => {
      if (!DOMAIN_REGEX.test(val)) return 'Invalid domain format';
      return null;
    },
    pillColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  },
  {
    key: 'cloud_accounts',
    label: 'Cloud Account IDs',
    placeholder: 'e.g. aws-prod-112233',
    icon: <Cloud className="w-4 h-4" />,
    validate: (val: string) => {
      if (val.trim().length < 3) return 'Account ID too short';
      return null;
    },
    pillColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
  },
  {
    key: 'exclusions',
    label: 'Exclusions',
    placeholder: 'e.g. 10.0.0.1/32 or prod-db.example.com',
    icon: <ShieldOff className="w-4 h-4" />,
    validate: (val: string) => {
      if (val.trim().length === 0) return 'Value cannot be empty';
      return null;
    },
    pillColor: 'bg-red-500/10 text-red-400 border-red-500/30',
  },
];

const ScopeEditor: React.FC<ScopeEditorProps> = ({ value, onChange }) => {
  const [inputValues, setInputValues] = useState<Record<keyof ScopeConfig, string>>({
    cidrs: '',
    domains: '',
    cloud_accounts: '',
    exclusions: '',
  });
  const [errors, setErrors] = useState<Record<keyof ScopeConfig, string | null>>({
    cidrs: null,
    domains: null,
    cloud_accounts: null,
    exclusions: null,
  });

  const handleAdd = useCallback(
    (section: SectionConfig) => {
      const raw = inputValues[section.key].trim();
      if (!raw) return;

      const error = section.validate(raw);
      if (error) {
        setErrors((prev) => ({ ...prev, [section.key]: error }));
        return;
      }

      if (value[section.key].includes(raw)) {
        setErrors((prev) => ({ ...prev, [section.key]: 'Already added' }));
        return;
      }

      setErrors((prev) => ({ ...prev, [section.key]: null }));
      setInputValues((prev) => ({ ...prev, [section.key]: '' }));
      onChange({
        ...value,
        [section.key]: [...value[section.key], raw],
      });
    },
    [inputValues, value, onChange]
  );

  const handleRemove = useCallback(
    (sectionKey: keyof ScopeConfig, item: string) => {
      onChange({
        ...value,
        [sectionKey]: value[sectionKey].filter((v) => v !== item),
      });
    },
    [value, onChange]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>, section: SectionConfig) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleAdd(section);
      }
    },
    [handleAdd]
  );

  return (
    <div className="space-y-6">
      {SECTIONS.map((section) => (
        <div key={section.key} className="space-y-3">
          {/* Section label */}
          <div className="flex items-center gap-2 text-slate-300">
            <span className="text-slate-400">{section.icon}</span>
            <label className="text-sm font-medium">{section.label}</label>
            <span className="text-xs text-slate-500">
              ({value[section.key].length})
            </span>
          </div>

          {/* Input row */}
          <div className="flex items-start gap-2">
            <div className="flex-1">
              <input
                type="text"
                value={inputValues[section.key]}
                onChange={(e) => {
                  setInputValues((prev) => ({ ...prev, [section.key]: e.target.value }));
                  if (errors[section.key]) {
                    setErrors((prev) => ({ ...prev, [section.key]: null }));
                  }
                }}
                onKeyDown={(e) => handleKeyDown(e, section)}
                placeholder={section.placeholder}
                className={clsx(
                  'w-full px-3 py-2 bg-slate-950 border rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-colors',
                  errors[section.key]
                    ? 'border-red-500/50'
                    : 'border-slate-700'
                )}
              />
              {errors[section.key] && (
                <p className="mt-1 text-xs text-red-400">{errors[section.key]}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => handleAdd(section)}
              className="px-3 py-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-sm rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <Plus className="w-4 h-4" />
            </button>
          </div>

          {/* Tags */}
          {value[section.key].length > 0 && (
            <div className="flex flex-wrap gap-2">
              {value[section.key].map((item) => (
                <span
                  key={item}
                  className={clsx(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium border rounded-full',
                    section.pillColor
                  )}
                >
                  {item}
                  <button
                    type="button"
                    onClick={() => handleRemove(section.key, item)}
                    className="hover:text-white transition-colors"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default ScopeEditor;
