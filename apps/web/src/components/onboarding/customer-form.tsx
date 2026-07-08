'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Users } from 'lucide-react';

interface CustomerFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

export function CustomerForm({ onSuccess, onCancel }: CustomerFormProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    customerCode: 'CUST-001',
    companyName: '',
    contactName: '',
    email: '',
    phone: '',
    country: 'Uzbekistan',
    city: '',
    address: '',
    paymentTerms: 'NET_30',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Call API to create customer
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create customer');
      }

      // Success - call parent callback
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 mb-6">
        <div className="rounded-lg bg-blue-100 p-2">
          <Users className="w-6 h-6 text-blue-600" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Add Your First Customer</h2>
          <p className="text-sm text-slate-600">Create a customer record to start taking orders</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Customer Code */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Customer Code
            </label>
            <Input
              type="text"
              name="customerCode"
              value={formData.customerCode}
              onChange={handleChange}
              placeholder="e.g., CUST-001"
              required
            />
          </div>

          {/* Company Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Company Name *
            </label>
            <Input
              type="text"
              name="companyName"
              value={formData.companyName}
              onChange={handleChange}
              placeholder="e.g., Silk Road Transport"
              required
            />
          </div>

          {/* Contact Name */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Contact Name *
            </label>
            <Input
              type="text"
              name="contactName"
              value={formData.contactName}
              onChange={handleChange}
              placeholder="e.g., Ahmed Khoja"
              required
            />
          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Email
            </label>
            <Input
              type="email"
              name="email"
              value={formData.email}
              onChange={handleChange}
              placeholder="contact@company.com"
            />
          </div>

          {/* Phone */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Phone *
            </label>
            <Input
              type="tel"
              name="phone"
              value={formData.phone}
              onChange={handleChange}
              placeholder="+998901234567"
              required
            />
          </div>

          {/* Country */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Country
            </label>
            <Input
              type="text"
              name="country"
              value={formData.country}
              onChange={handleChange}
              placeholder="Uzbekistan"
            />
          </div>

          {/* City */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              City
            </label>
            <Input
              type="text"
              name="city"
              value={formData.city}
              onChange={handleChange}
              placeholder="e.g., Tashkent"
            />
          </div>

          {/* Address */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Address
            </label>
            <Input
              type="text"
              name="address"
              value={formData.address}
              onChange={handleChange}
              placeholder="Street address"
            />
          </div>

          {/* Payment Terms */}
          <div className="md:col-span-2">
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Payment Terms
            </label>
            <select
              name="paymentTerms"
              value={formData.paymentTerms}
              onChange={handleChange}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="DUE_ON_RECEIPT">Due on Receipt</option>
              <option value="NET_15">Net 15</option>
              <option value="NET_30">Net 30</option>
              <option value="NET_45">Net 45</option>
            </select>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-6">
          <Button
            type="submit"
            disabled={loading}
            className="flex-1"
          >
            {loading ? 'Creating...' : 'Create Customer'}
          </Button>
          {onCancel && (
            <Button
              type="button"
              variant="outline"
              onClick={onCancel}
              disabled={loading}
              className="flex-1"
            >
              Skip for Now
            </Button>
          )}
        </div>
      </form>

      <p className="text-xs text-slate-500 pt-4">
        * Required fields. You can add more customers and modify details later.
      </p>
    </div>
  );
}
