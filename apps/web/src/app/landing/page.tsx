'use client';

import Link from 'next/link';
import { Zap, TrendingUp, Truck } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="flex flex-col min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-blue-600">FlowERP AI</div>
          <div className="flex gap-4">
            <Link
              href="/auth/login"
              className="px-4 py-2 text-slate-700 hover:text-slate-900 font-medium"
            >
              Sign In
            </Link>
            <Link
              href="/auth/register"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium"
            >
              Get Started
            </Link>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col justify-center items-center px-6 py-24">
        <div className="max-w-3xl text-center">
          <h1 className="text-5xl font-bold text-slate-900 mb-6">
            Intelligent Logistics Operations Platform
          </h1>
          <p className="text-xl text-slate-600 mb-12">
            Streamline order management, optimize dispatch, manage your fleet, track finances, and generate actionable insights — all in one powerful platform built for modern logistics companies.
          </p>

          <div className="flex gap-4 justify-center mb-16">
            <Link
              href="/auth/register"
              className="px-8 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-lg transition"
            >
              Start Free Trial
            </Link>
            <Link
              href="/auth/login"
              className="px-8 py-3 border-2 border-slate-300 text-slate-900 rounded-lg hover:bg-slate-100 font-semibold text-lg transition"
            >
              Sign In
            </Link>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
            {[
              {
                icon: Truck,
                title: 'Order & Dispatch',
                description: 'Manage orders from creation to delivery with intelligent dispatch routing',
              },
              {
                icon: TrendingUp,
                title: 'Financial Control',
                description: 'Track invoices, payments, and expenses in real-time for complete financial visibility',
              },
              {
                icon: Zap,
                title: 'AI-Powered Insights',
                description: 'Generate reports and get actionable intelligence to optimize operations',
              },
            ].map((feature) => (
              <div key={feature.title} className="bg-white p-8 rounded-lg shadow-sm hover:shadow-md transition">
                <feature.icon className="w-12 h-12 text-blue-600 mb-4 mx-auto" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">{feature.title}</h3>
                <p className="text-slate-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-300 py-8">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <p>&copy; 2026 FlowERP AI. All rights reserved. Built for logistics excellence.</p>
        </div>
      </footer>
    </div>
  );
}
