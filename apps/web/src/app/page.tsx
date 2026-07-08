'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Package,
  TrendingUp,
  Truck,
  MapPin,
  DollarSign,
  BarChart3,
  Users,
  Clock,
  CheckCircle2,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';

export default function RootPage() {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(true);
  const [isChecking, setIsChecking] = useState(true);

  useEffect(() => {
    // Check if user is authenticated by attempting to fetch protected endpoint
    const checkAuth = async () => {
      try {
        const res = await fetch('/api/onboarding/progress', {
          method: 'GET',
          credentials: 'include',
        });

        if (res.status === 200) {
          // User is authenticated - redirect to app
          router.replace('/app');
          return;
        }
      } catch (error) {
        // Network error or endpoint doesn't exist - show landing page
      }

      setShowLanding(true);
      setIsChecking(false);
    };

    checkAuth();
  }, [router]);

  // While checking auth, show loading state
  if (isChecking) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!showLanding) {
    return null;
  }
  return (
    <div className="flex flex-col min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-slate-200 sticky top-0 z-40 bg-white">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Truck className="w-6 h-6 text-blue-600" />
            <span className="text-xl font-bold text-slate-900">FlowERP</span>
          </div>
          <nav className="hidden md:flex gap-8 items-center">
            <a href="#product" className="text-sm text-slate-600 hover:text-slate-900">Product</a>
            <a href="#workflow" className="text-sm text-slate-600 hover:text-slate-900">Workflow</a>
            <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900">FAQ</a>
          </nav>
          <Link
            href="/auth/login"
            className="px-4 py-2 text-sm font-medium text-slate-700 hover:text-slate-900"
          >
            Sign In
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="max-w-7xl mx-auto px-6 py-20 text-center">
        <h1 className="text-5xl md:text-6xl font-bold text-slate-900 mb-6 leading-tight">
          Logistics Operations Simplified
        </h1>
        <p className="text-xl text-slate-600 mb-12 max-w-3xl mx-auto">
          FlowERP is the all-in-one platform for modern logistics companies. Manage orders, optimize dispatch, track your fleet, control finances, and make data-driven decisions—without the complexity.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center mb-16">
          <a
            href="mailto:sales@flowerpai.com?subject=Demo Request"
            className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold transition inline-block"
          >
            Request a Demo
          </a>
          <a
            href="mailto:sales@flowerpai.com?subject=Sales Inquiry"
            className="px-8 py-3 border-2 border-slate-300 text-slate-900 rounded-lg hover:bg-slate-50 font-semibold transition inline-block"
          >
            Talk to Sales
          </a>
          <Link
            href="/auth/login"
            className="px-8 py-3 border-2 border-blue-600 text-blue-600 rounded-lg hover:bg-blue-50 font-semibold transition"
          >
            Sign In to Workspace
          </Link>
        </div>
      </section>

      {/* Product Capabilities */}
      <section id="product" className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-slate-900 mb-4 text-center">Everything You Need to Run Logistics</h2>
          <p className="text-center text-slate-600 mb-16 max-w-2xl mx-auto">
            From order creation to financial reporting, manage your entire logistics operation in one unified platform.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-6">
            {[
              { icon: Package, title: 'Orders', desc: 'Create and track shipments' },
              { icon: MapPin, title: 'Dispatch', desc: 'Optimize routes & assignments' },
              { icon: Truck, title: 'Vehicles', desc: 'Manage your fleet' },
              { icon: Users, title: 'Drivers', desc: 'Driver profiles & tracking' },
              { icon: DollarSign, title: 'Finance', desc: 'Invoices & payments' },
              { icon: BarChart3, title: 'Reports', desc: 'Real-time insights' },
            ].map((item) => (
              <div key={item.title} className="bg-white p-6 rounded-lg border border-slate-200 text-center hover:border-blue-300 transition">
                <item.icon className="w-8 h-8 text-blue-600 mx-auto mb-3" />
                <h3 className="font-semibold text-slate-900 mb-1">{item.title}</h3>
                <p className="text-sm text-slate-600">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Workflow */}
      <section id="workflow" className="py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-slate-900 mb-4 text-center">How It Works</h2>
          <p className="text-center text-slate-600 mb-16 max-w-2xl mx-auto">
            A streamlined workflow from order to delivery, with full visibility and control at every step.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {[
              {
                step: '1',
                title: 'Create Order',
                desc: 'Register customer shipment details, pickup/delivery locations, and cargo',
              },
              {
                step: '2',
                title: 'Assign Driver',
                desc: 'Automatically or manually assign drivers and vehicles to orders',
              },
              {
                step: '3',
                title: 'Track Delivery',
                desc: 'Monitor progress in real-time from pickup to delivery completion',
              },
              {
                step: '4',
                title: 'Manage Finance',
                desc: 'Auto-generate invoices, record payments, and track profitability',
              },
            ].map((item) => (
              <div key={item.step} className="relative">
                <div className="bg-gradient-to-br from-blue-50 to-blue-100 p-8 rounded-lg border border-blue-200">
                  <div className="w-10 h-10 bg-blue-600 text-white rounded-full flex items-center justify-center font-bold mb-4">
                    {item.step}
                  </div>
                  <h3 className="font-semibold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-slate-600 text-sm">{item.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Target Teams */}
      <section className="bg-slate-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-slate-900 mb-16 text-center">Built for Logistics Teams</h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {[
              {
                title: 'Operations Managers',
                benefits: ['Dispatch optimization', 'Real-time tracking', 'Performance reports'],
              },
              {
                title: 'Finance Teams',
                benefits: ['Automated invoicing', 'Payment tracking', 'Financial forecasting'],
              },
              {
                title: 'Executives',
                benefits: ['Operational dashboards', 'Profitability insights', 'KPI monitoring'],
              },
            ].map((team) => (
              <div key={team.title} className="bg-white p-8 rounded-lg border border-slate-200">
                <h3 className="text-xl font-semibold text-slate-900 mb-6">{team.title}</h3>
                <ul className="space-y-3">
                  {team.benefits.map((benefit) => (
                    <li key={benefit} className="flex gap-3 items-start">
                      <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-600">{benefit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" className="py-20">
        <div className="max-w-3xl mx-auto px-6">
          <h2 className="text-4xl font-bold text-slate-900 mb-12 text-center">Frequently Asked Questions</h2>

          <div className="space-y-4">
            {[
              {
                q: 'How do I get started?',
                a: 'Contact our sales team to request a demo or discuss your logistics needs. We will provision your organization and send you workspace access.',
              },
              {
                q: 'Is my data secure?',
                a: 'Yes. FlowERP uses enterprise-grade encryption, multi-tenant isolation, and regular security audits to protect your data.',
              },
              {
                q: 'Can I manage multiple organizations?',
                a: 'Yes. Users can belong to multiple organizations and switch workspaces easily.',
              },
              {
                q: 'Do you offer training?',
                a: 'Yes. We provide onboarding support, documentation, and training sessions for your team.',
              },
            ].map((item) => (
              <div key={item.q} className="border border-slate-200 rounded-lg p-6 hover:border-blue-300 transition">
                <h3 className="font-semibold text-slate-900 mb-2">{item.q}</h3>
                <p className="text-slate-600">{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-12 mt-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <Truck className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-white">FlowERP</span>
              </div>
              <p className="text-sm">Logistics operations platform for modern companies.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#product" className="hover:text-white">Features</a></li>
                <li><a href="#workflow" className="hover:text-white">Workflow</a></li>
                <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Company</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:sales@flowerpai.com" className="hover:text-white">Contact Sales</a></li>
                <li><a href="mailto:support@flowerpai.com" className="hover:text-white">Support</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Access</h4>
              <ul className="space-y-2 text-sm">
                <li><Link href="/auth/login" className="hover:text-white">Sign In</Link></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-700 pt-8 text-center text-sm">
            <p>&copy; 2026 FlowERP. All rights reserved. | Built for logistics excellence.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
