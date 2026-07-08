'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Package } from 'lucide-react';

interface OrderFormProps {
  onSuccess: () => void;
  onCancel?: () => void;
}

interface Customer {
  id: string;
  companyName: string;
}

export function OrderForm({ onSuccess, onCancel }: OrderFormProps) {
  const [loading, setLoading] = useState(false);
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);

  const [formData, setFormData] = useState({
    customerId: '',
    pickupAddress: '',
    pickupCity: '',
    pickupDate: '',
    pickupTime: '09:00',
    deliveryAddress: '',
    deliveryCity: '',
    deliveryDate: '',
    deliveryTime: '17:00',
    cargoDescription: '',
    price: '',
    currency: 'UZS',
  });

  // Fetch customers on mount
  useEffect(() => {
    const fetchCustomers = async () => {
      try {
        const response = await fetch('/api/customers');
        if (response.ok) {
          const data = await response.json();
          setCustomers(data.data || []);
          if (data.data?.length > 0) {
            setFormData((prev) => ({
              ...prev,
              customerId: data.data[0].id,
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch customers:', err);
      } finally {
        setLoadingCustomers(false);
      }
    };

    fetchCustomers();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
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
      // Combine date and time into ISO datetime
      const pickupDateTime = new Date(`${formData.pickupDate}T${formData.pickupTime}:00Z`).toISOString();
      const deliveryDateTime = new Date(`${formData.deliveryDate}T${formData.deliveryTime}:00Z`).toISOString();

      const payload = {
        customerId: formData.customerId,
        pickupAddress: formData.pickupAddress,
        pickupCity: formData.pickupCity,
        pickupDate: pickupDateTime,
        deliveryAddress: formData.deliveryAddress,
        deliveryCity: formData.deliveryCity,
        deliveryDate: deliveryDateTime,
        cargoDescription: formData.cargoDescription,
        price: parseFloat(formData.price) || 0,
        currency: formData.currency,
      };

      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.message || 'Failed to create order');
      }

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
        <div className="rounded-lg bg-purple-100 p-2">
          <Package className="w-6 h-6 text-purple-600" />
        </div>
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Create Your First Order</h2>
          <p className="text-sm text-slate-600">Register a shipment to start logistics operations</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
          </div>
        )}

        {/* Customer Selection */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">
            Customer *
          </label>
          {loadingCustomers ? (
            <div className="text-sm text-slate-500">Loading customers...</div>
          ) : customers.length === 0 ? (
            <div className="text-sm text-red-600">No customers found. Please create a customer first.</div>
          ) : (
            <select
              name="customerId"
              value={formData.customerId}
              onChange={handleChange}
              required
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>
                  {customer.companyName}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Pickup Section */}
        <div className="border-t pt-4 mt-4">
          <h3 className="font-semibold text-slate-700 mb-3">Pickup Location</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address *
              </label>
              <Input
                type="text"
                name="pickupAddress"
                value={formData.pickupAddress}
                onChange={handleChange}
                placeholder="e.g., 123 Industrial Avenue"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                City *
              </label>
              <Input
                type="text"
                name="pickupCity"
                value={formData.pickupCity}
                onChange={handleChange}
                placeholder="e.g., Tashkent"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date *
              </label>
              <Input
                type="date"
                name="pickupDate"
                value={formData.pickupDate}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Time
              </label>
              <Input
                type="time"
                name="pickupTime"
                value={formData.pickupTime}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* Delivery Section */}
        <div className="border-t pt-4">
          <h3 className="font-semibold text-slate-700 mb-3">Delivery Location</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Address *
              </label>
              <Input
                type="text"
                name="deliveryAddress"
                value={formData.deliveryAddress}
                onChange={handleChange}
                placeholder="e.g., 456 Commerce Street"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                City *
              </label>
              <Input
                type="text"
                name="deliveryCity"
                value={formData.deliveryCity}
                onChange={handleChange}
                placeholder="e.g., Samarkand"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date *
              </label>
              <Input
                type="date"
                name="deliveryDate"
                value={formData.deliveryDate}
                onChange={handleChange}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Time
              </label>
              <Input
                type="time"
                name="deliveryTime"
                value={formData.deliveryTime}
                onChange={handleChange}
              />
            </div>
          </div>
        </div>

        {/* Cargo Section */}
        <div className="border-t pt-4">
          <h3 className="font-semibold text-slate-700 mb-3">Cargo Details</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Description
              </label>
              <textarea
                name="cargoDescription"
                value={formData.cargoDescription}
                onChange={handleChange}
                placeholder="e.g., Electronics and textiles"
                rows={3}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Price
              </label>
              <Input
                type="number"
                name="price"
                value={formData.price}
                onChange={handleChange}
                placeholder="e.g., 150000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Currency
              </label>
              <select
                name="currency"
                value={formData.currency}
                onChange={handleChange}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="UZS">UZS (Uzbek Som)</option>
                <option value="USD">USD (US Dollar)</option>
                <option value="EUR">EUR (Euro)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-6 border-t">
          <Button
            type="submit"
            disabled={loading || loadingCustomers || customers.length === 0}
            className="flex-1"
          >
            {loading ? 'Creating...' : 'Create Order'}
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
        * Required fields. You can modify order details after creation.
      </p>
    </div>
  );
}
