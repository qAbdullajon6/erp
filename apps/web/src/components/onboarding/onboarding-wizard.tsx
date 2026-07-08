'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { CustomerForm } from './customer-form';
import { DriverForm } from './driver-form';
import { VehicleForm } from './vehicle-form';
import { OrderForm } from './order-form';
import { Button } from '@/components/ui/button';

type OnboardingStep = 'organizationProfile' | 'firstCustomer' | 'firstDriver' | 'firstVehicle' | 'firstOrder';

interface OnboardingWizardProps {
  onOnboardingComplete: () => void;
}

const STEPS: { id: OnboardingStep; label: string; description: string }[] = [
  { id: 'organizationProfile', label: 'Organization Profile', description: 'Set up your company details' },
  { id: 'firstCustomer', label: 'First Customer', description: 'Add your first customer' },
  { id: 'firstDriver', label: 'First Driver', description: 'Hire your first driver' },
  { id: 'firstVehicle', label: 'First Vehicle', description: 'Add your first vehicle' },
  { id: 'firstOrder', label: 'First Order', description: 'Create your first order' },
];

export function OnboardingWizard({ onOnboardingComplete }: OnboardingWizardProps) {
  const [currentStep, setCurrentStep] = useState(0);
  const [completedSteps, setCompletedSteps] = useState<Set<OnboardingStep>>(new Set());

  const handleStepComplete = async () => {
    const step = STEPS[currentStep];
    try {
      const res = await fetch(`/api/onboarding/steps/${step.id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const newCompleted = new Set(completedSteps);
        newCompleted.add(step.id);
        setCompletedSteps(newCompleted);

        if (currentStep < STEPS.length - 1) {
          setCurrentStep(currentStep + 1);
        } else {
          onOnboardingComplete();
        }
      }
    } catch (error) {
      console.error('Failed to complete step:', error);
    }
  };

  const handleSkip = async () => {
    try {
      await fetch('/api/onboarding/skip', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      onOnboardingComplete();
    } catch (error) {
      console.error('Failed to skip onboarding:', error);
    }
  };

  const step = STEPS[currentStep];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="max-w-2xl w-full">
        {/* Progress Steps */}
        <div className="mb-12">
          <div className="flex items-center justify-between mb-8">
            {STEPS.map((s, idx) => (
              <div key={s.id} className="flex items-center flex-1">
                <div
                  className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center font-semibold transition ${
                    completedSteps.has(s.id)
                      ? 'bg-green-500 text-white'
                      : idx === currentStep
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {completedSteps.has(s.id) ? <CheckCircle2 className="w-5 h-5" /> : idx + 1}
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`flex-1 h-1 mx-2 ${idx < currentStep ? 'bg-green-500' : 'bg-slate-200'}`} />
                )}
              </div>
            ))}
          </div>

          {/* Step Descriptions */}
          <div className="grid grid-cols-5 gap-2">
            {STEPS.map((s) => (
              <div key={s.id} className="text-center">
                <p className="text-xs font-medium text-slate-700">{s.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-lg shadow-lg p-8">
          {/* Step Content */}
          {step.id === 'organizationProfile' && (
            <div className="space-y-6">
              <div>
                <h1 className="text-3xl font-bold text-slate-900 mb-2">{step.label}</h1>
                <p className="text-slate-600 mb-8">{step.description}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p className="text-sm text-blue-700">
                  Your organization was created during registration. Profile details are managed in <strong>Settings → Organization</strong>.
                </p>
              </div>
              <div className="flex gap-4 pt-6">
                <Button
                  onClick={handleStepComplete}
                  className="flex-1"
                >
                  Continue to Next Step
                </Button>
                <Button
                  onClick={handleSkip}
                  variant="outline"
                  className="flex-1"
                >
                  Skip Onboarding
                </Button>
              </div>
            </div>
          )}

          {step.id === 'firstCustomer' && (
            <CustomerForm
              onSuccess={handleStepComplete}
              onCancel={handleSkip}
            />
          )}

          {step.id === 'firstDriver' && (
            <DriverForm
              onSuccess={handleStepComplete}
              onCancel={handleSkip}
            />
          )}

          {step.id === 'firstVehicle' && (
            <VehicleForm
              onSuccess={handleStepComplete}
              onCancel={handleSkip}
            />
          )}

          {step.id === 'firstOrder' && (
            <OrderForm
              onSuccess={handleStepComplete}
              onCancel={handleSkip}
            />
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-slate-600 text-sm mt-6">
          You can complete these steps anytime from your organization settings.
        </p>
      </div>
    </div>
  );
}
