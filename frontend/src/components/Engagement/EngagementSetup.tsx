import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, FileText, Target, ScrollText, ClipboardCheck, AlertCircle } from 'lucide-react';
import { clsx } from 'clsx';
import ScopeEditor from './ScopeEditor';
import { Badge } from '../common/Badge';
import { ScopeConfig } from '../../types';
import api from '../../services/api';

interface FormData {
  name: string;
  description: string;
  scope: ScopeConfig;
  rulesOfEngagement: string;
}

const INITIAL_SCOPE: ScopeConfig = {
  cidrs: [],
  domains: [],
  cloud_accounts: [],
  exclusions: [],
};

const SUGGESTED_TEMPLATES = [
  {
    label: 'Standard External Pentest',
    content: `1. Testing is limited to the specified external IP ranges and domains.
2. No denial-of-service (DoS) attacks.
3. No social engineering or phishing without prior written approval.
4. Testing hours: Monday-Friday, 08:00-18:00 UTC.
5. Immediately report any critical findings that pose imminent risk.
6. All data exfiltrated during testing must be securely deleted within 48 hours.`,
  },
  {
    label: 'Internal Red Team',
    content: `1. Assume-breach scenario: Red team begins with domain user credentials.
2. Lateral movement is authorized up to Tier 2 (Exploit).
3. Tier 3 (Lateral movement / privilege escalation) requires explicit lead approval.
4. Production databases are excluded from destructive actions.
5. All persistence mechanisms must be documented and removed post-engagement.
6. Blue team will not be notified (purple team exercises excluded).`,
  },
  {
    label: 'Cloud Security Assessment',
    content: `1. Testing limited to specified cloud accounts and resource groups.
2. No modification of IAM root/organization-level policies.
3. No actions that could affect billing beyond $500 USD threshold.
4. Snapshot and backup enumeration allowed; deletion prohibited.
5. Serverless function invocation allowed in staging only.
6. Findings involving customer data must be escalated immediately.`,
  },
];

const STEPS = [
  { label: 'Basic Info', icon: FileText },
  { label: 'Scope', icon: Target },
  { label: 'Rules of Engagement', icon: ScrollText },
  { label: 'Review & Create', icon: ClipboardCheck },
];

const EngagementSetup: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(0);
  const [formData, setFormData] = useState<FormData>({
    name: '',
    description: '',
    scope: { ...INITIAL_SCOPE },
    rulesOfEngagement: '',
  });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const canProceed = (): boolean => {
    switch (currentStep) {
      case 0:
        return formData.name.trim().length > 0;
      case 1:
        return (
          formData.scope.cidrs.length > 0 ||
          formData.scope.domains.length > 0 ||
          formData.scope.cloud_accounts.length > 0
        );
      case 2:
        return formData.rulesOfEngagement.trim().length > 0;
      case 3:
        return true;
      default:
        return false;
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    setCreateError(null);
    try {
      const response = await api.createEngagement({
        name: formData.name,
        description: formData.description,
        scope_config: formData.scope,
        rules_of_engagement: formData.rulesOfEngagement,
      });
      navigate(response?.id ? `/engagements/${response.id}` : '/engagements');
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create engagement');
    } finally {
      setCreating(false);
    }
  };

  const scopeItemCount =
    formData.scope.cidrs.length +
    formData.scope.domains.length +
    formData.scope.cloud_accounts.length;

  return (
    <div className="max-w-3xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <button
          onClick={() => navigate('/engagements')}
          className="inline-flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200 transition-colors mb-4"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Engagements
        </button>
        <h1 className="text-2xl font-bold text-slate-100">New Engagement</h1>
        <p className="mt-1 text-sm text-slate-400">
          Set up a new red team engagement in {STEPS.length} steps
        </p>
      </div>

      {/* Step Indicator */}
      <div className="relative">
        <div className="flex items-center justify-between">
          {STEPS.map((step, index) => {
            const StepIcon = step.icon;
            const isCompleted = index < currentStep;
            const isCurrent = index === currentStep;
            return (
              <div key={step.label} className="flex flex-col items-center relative z-10">
                <div
                  className={clsx(
                    'w-10 h-10 rounded-full flex items-center justify-center border-2 transition-all',
                    isCompleted
                      ? 'bg-indigo-500 border-indigo-500 text-white'
                      : isCurrent
                      ? 'bg-slate-900 border-indigo-500 text-indigo-400'
                      : 'bg-slate-900 border-slate-700 text-slate-500'
                  )}
                >
                  {isCompleted ? (
                    <Check className="w-5 h-5" />
                  ) : (
                    <StepIcon className="w-4 h-4" />
                  )}
                </div>
                <span
                  className={clsx(
                    'mt-2 text-xs font-medium',
                    isCurrent ? 'text-indigo-400' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                  )}
                >
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
        {/* Connector line */}
        <div className="absolute top-5 left-0 right-0 flex items-center px-16 -z-0">
          <div className="w-full h-0.5 bg-slate-700 relative">
            <div
              className="absolute h-full bg-indigo-500 transition-all duration-300"
              style={{ width: `${(currentStep / (STEPS.length - 1)) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Step Content */}
      <div className="bg-slate-900 border border-slate-700 rounded-xl p-6">
        {/* Step 1: Basic Info */}
        {currentStep === 0 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Basic Information</h2>
              <p className="text-sm text-slate-400">
                Provide a name and description for this engagement.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Engagement Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((prev) => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Q4 External Penetration Test"
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the purpose and objectives of this engagement..."
                  rows={4}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
                />
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Scope */}
        {currentStep === 1 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Define Scope</h2>
              <p className="text-sm text-slate-400">
                Specify the target CIDR ranges, domains, cloud accounts, and exclusions.
              </p>
            </div>
            <ScopeEditor
              value={formData.scope}
              onChange={(scope) => setFormData((prev) => ({ ...prev, scope }))}
            />
          </div>
        )}

        {/* Step 3: Rules of Engagement */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Rules of Engagement</h2>
              <p className="text-sm text-slate-400">
                Define the constraints and rules that govern this engagement.
              </p>
            </div>

            {/* Suggested templates */}
            <div>
              <label className="block text-sm font-medium text-slate-300 mb-2">
                Start from a template
              </label>
              <div className="flex flex-wrap gap-2 mb-4">
                {SUGGESTED_TEMPLATES.map((template) => (
                  <button
                    key={template.label}
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        rulesOfEngagement: template.content,
                      }))
                    }
                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs text-slate-300 rounded-lg transition-colors"
                  >
                    {template.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-slate-300 mb-1.5">
                Rules <span className="text-red-400">*</span>
              </label>
              <textarea
                value={formData.rulesOfEngagement}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, rulesOfEngagement: e.target.value }))
                }
                placeholder="Define rules, constraints, and boundaries for the engagement..."
                rows={10}
                className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-lg text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none font-mono"
              />
            </div>
          </div>
        )}

        {/* Step 4: Review */}
        {currentStep === 3 && (
          <div className="space-y-6">
            <div>
              <h2 className="text-lg font-semibold text-slate-100 mb-1">Review & Create</h2>
              <p className="text-sm text-slate-400">
                Review all details before creating the engagement.
              </p>
            </div>

            {/* Basic Info Review */}
            <div className="p-4 bg-slate-950 border border-slate-700 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Basic Info
              </h3>
              <div className="space-y-2">
                <div>
                  <span className="text-xs text-slate-500">Name</span>
                  <p className="text-sm text-slate-200">{formData.name}</p>
                </div>
                {formData.description && (
                  <div>
                    <span className="text-xs text-slate-500">Description</span>
                    <p className="text-sm text-slate-200">{formData.description}</p>
                  </div>
                )}
              </div>
            </div>

            {/* Scope Review */}
            <div className="p-4 bg-slate-950 border border-slate-700 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Scope
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {formData.scope.cidrs.length > 0 && (
                  <div>
                    <span className="text-xs text-slate-500">CIDR Ranges</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formData.scope.cidrs.map((c) => (
                        <Badge key={c} variant="info" size="sm">{c}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {formData.scope.domains.length > 0 && (
                  <div>
                    <span className="text-xs text-slate-500">Domains</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formData.scope.domains.map((d) => (
                        <Badge key={d} variant="success" size="sm">{d}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {formData.scope.cloud_accounts.length > 0 && (
                  <div>
                    <span className="text-xs text-slate-500">Cloud Accounts</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formData.scope.cloud_accounts.map((a) => (
                        <Badge key={a} variant="warning" size="sm">{a}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {formData.scope.exclusions.length > 0 && (
                  <div>
                    <span className="text-xs text-slate-500">Exclusions</span>
                    <div className="flex flex-wrap gap-1 mt-1">
                      {formData.scope.exclusions.map((e) => (
                        <Badge key={e} variant="danger" size="sm">{e}</Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {scopeItemCount === 0 && (
                <p className="text-sm text-slate-500 italic">No scope items defined.</p>
              )}
            </div>

            {/* Rules Review */}
            <div className="p-4 bg-slate-950 border border-slate-700 rounded-lg space-y-3">
              <h3 className="text-sm font-semibold text-slate-300 uppercase tracking-wider">
                Rules of Engagement
              </h3>
              <pre className="text-sm text-slate-200 whitespace-pre-wrap font-mono leading-relaxed">
                {formData.rulesOfEngagement}
              </pre>
            </div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {createError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg">
          <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
          <p className="text-sm text-red-400">{createError}</p>
        </div>
      )}

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCurrentStep((prev) => prev - 1)}
          disabled={currentStep === 0 || creating}
          className={clsx(
            'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
            currentStep === 0 || creating
              ? 'text-slate-600 cursor-not-allowed'
              : 'text-slate-300 hover:text-slate-100 bg-slate-800 hover:bg-slate-700 border border-slate-700'
          )}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>

        {currentStep < STEPS.length - 1 ? (
          <button
            onClick={() => setCurrentStep((prev) => prev + 1)}
            disabled={!canProceed()}
            className={clsx(
              'inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-lg transition-colors',
              canProceed()
                ? 'bg-indigo-500 hover:bg-indigo-600 text-white'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            )}
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <button
            onClick={handleCreate}
            disabled={creating}
            className={clsx(
              'inline-flex items-center gap-2 px-6 py-2.5 text-sm font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-slate-950',
              creating
                ? 'bg-indigo-500/70 text-white/70 cursor-not-allowed'
                : 'bg-indigo-500 hover:bg-indigo-600 text-white'
            )}
          >
            {creating ? (
              <>
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Creating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Create Engagement
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
};

export default EngagementSetup;
