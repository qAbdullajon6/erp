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
  Zap,
  ArrowRight,
  ChevronRight,
  MessageSquare,
  Brain,
  Calendar,
  Activity,
  TrendingDown,
  AlertTriangle,
  LineChart,
} from 'lucide-react';

interface DemoFormData {
  fullName: string;
  workEmail: string;
  companyName: string;
  phone: string;
  vehicles?: string;
  message?: string;
}

interface FormErrors {
  [key: string]: string;
}

export default function RootPage() {
  const router = useRouter();
  const [showLanding, setShowLanding] = useState(true);
  const [isChecking, setIsChecking] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [demoModalOpen, setDemoModalOpen] = useState(false);
  const [formData, setFormData] = useState<DemoFormData>({
    fullName: '',
    workEmail: '',
    companyName: '',
    phone: '',
    vehicles: '',
    message: '',
  });
  const [formErrors, setFormErrors] = useState<FormErrors>({});
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formSubmitted, setFormSubmitted] = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

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
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-pulse text-slate-400">Loading...</div>
      </div>
    );
  }

  if (!showLanding) {
    return null;
  }

  const validateForm = (): boolean => {
    const errors: FormErrors = {};

    if (!formData.fullName.trim()) {
      errors.fullName = 'Full name is required';
    }
    if (!formData.workEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.workEmail)) {
      errors.workEmail = 'Valid email is required';
    }
    if (!formData.companyName.trim()) {
      errors.companyName = 'Company name is required';
    }
    if (!formData.phone.trim()) {
      errors.phone = 'Phone number is required';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
    if (formErrors[name]) {
      setFormErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const handleFormSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setFormSubmitting(true);

    try {
      // TODO: Integrate with actual backend API endpoint
      // For now, just show success state after validation
      await new Promise(resolve => setTimeout(resolve, 800));

      setFormSubmitted(true);
      setFormData({
        fullName: '',
        workEmail: '',
        companyName: '',
        phone: '',
        vehicles: '',
        message: '',
      });

      setTimeout(() => {
        setDemoModalOpen(false);
        setFormSubmitted(false);
      }, 3000);
    } catch (error) {
      console.error('Form submission error:', error);
    } finally {
      setFormSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Header */}
      <header className="border-b border-slate-800/40 sticky top-0 z-50 bg-slate-950/80 backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex justify-between items-center">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
              <Zap className="w-5 h-5 text-slate-950" />
            </div>
            <span className="text-base font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent" style={{ fontFamily: 'var(--font-manrope)' }}>
              FlowERP AI
            </span>
          </div>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex gap-10 items-center" style={{ fontFamily: 'var(--font-inter)' }}>
            <a href="#product" className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
              Product
            </a>
            <a href="#how-it-works" className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
              How It Works
            </a>
            <a href="#faq" className="text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors">
              FAQ
            </a>
          </nav>

          {/* Desktop CTA */}
          <div className="hidden md:flex gap-3 items-center" style={{ fontFamily: 'var(--font-inter)' }}>
            <Link
              href="/auth/login"
              className="px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
            >
              Sign In
            </Link>
            <button
              onClick={() => setDemoModalOpen(true)}
              className="px-5 py-2 rounded-lg bg-gradient-to-r from-blue-500 via-blue-500 to-blue-600 hover:from-blue-600 hover:via-blue-600 hover:to-blue-700 text-white text-sm font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30 transform hover:translate-y-px"
            >
              Book a Demo
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-400 hover:text-white"
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800/40 bg-slate-900/80 px-4 py-4 space-y-3" style={{ fontFamily: 'var(--font-inter)' }}>
            <a
              href="#product"
              className="block text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              Product
            </a>
            <a
              href="#how-it-works"
              className="block text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              How It Works
            </a>
            <a
              href="#faq"
              className="block text-sm font-medium text-slate-400 hover:text-slate-200 transition-colors"
              onClick={() => setMobileMenuOpen(false)}
            >
              FAQ
            </a>
            <div className="pt-3 space-y-2 border-t border-slate-800/40">
              <Link
                href="/auth/login"
                className="block px-4 py-2 text-sm font-medium text-slate-300 hover:text-white transition-colors"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign In
              </Link>
              <button
                onClick={() => {
                  setDemoModalOpen(true);
                  setMobileMenuOpen(false);
                }}
                className="w-full px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-semibold transition-all"
              >
                Book a Demo
              </button>
            </div>
          </div>
        )}
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 sm:py-28 lg:py-36">
        {/* Gradient Background */}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900 via-slate-950 to-slate-950 -z-10" />
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-full h-96 bg-gradient-to-b from-blue-600/15 via-blue-500/10 to-transparent rounded-full blur-3xl -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            {/* Left Content */}
            <div className="order-2 lg:order-1">
              <div className="inline-block mb-6">
                <span className="px-3.5 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/20 text-xs font-medium text-blue-300 tracking-wide" style={{ fontFamily: 'var(--font-inter)' }}>
                  AI-Powered Logistics Platform
                </span>
              </div>

              <h1
                className="text-5xl sm:text-6xl lg:text-7xl font-bold tracking-tight mb-6 leading-tight text-white"
                style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.03em' }}
              >
                Run Every Delivery From One{' '}
                <span className="bg-gradient-to-r from-blue-400 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
                  Intelligent Command Center
                </span>
              </h1>

              <p className="text-lg text-slate-300 mb-8 leading-relaxed max-w-2xl" style={{ fontFamily: 'var(--font-inter)' }}>
                FlowERP AI helps logistics teams manage orders, dispatch drivers, track deliveries, control payments, and make faster decisions — all from one connected workspace.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 mb-10" style={{ fontFamily: 'var(--font-inter)' }}>
                <button
                  onClick={() => setDemoModalOpen(true)}
                  className="px-8 py-3.5 rounded-lg bg-gradient-to-r from-blue-500 via-blue-500 to-blue-600 hover:from-blue-600 hover:via-blue-600 hover:to-blue-700 text-white font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30 transform hover:translate-y-px flex items-center justify-center gap-2"
                >
                  Book a Free Demo
                  <ArrowRight className="w-4 h-4" />
                </button>
                <Link
                  href="/app"
                  className="px-8 py-3.5 rounded-lg border border-slate-700/60 hover:border-slate-600/80 hover:bg-slate-800/40 text-slate-200 hover:text-white font-semibold transition-colors flex items-center justify-center gap-2"
                >
                  Explore Live Demo
                  <ChevronRight className="w-4 h-4" />
                </Link>
              </div>

              <p className="text-sm text-slate-500 font-medium" style={{ fontFamily: 'var(--font-inter)' }}>
                No credit card required · Built for logistics teams · Setup support included
              </p>
            </div>

            {/* Right - Product Preview */}
            <div className="order-1 lg:order-2">
              <div className="relative">
                {/* Blue Glow */}
                <div className="absolute inset-0 bg-gradient-to-br from-blue-600/25 to-cyan-600/15 rounded-2xl blur-3xl -z-10 opacity-80" />

                {/* Product Card Container */}
                <div className="bg-slate-800/40 border border-slate-700/40 rounded-2xl p-5 sm:p-7 backdrop-blur-md">
                  {/* Fake Dashboard Preview */}
                  <div className="bg-gradient-to-br from-slate-700/60 to-slate-800/60 rounded-xl h-72 sm:h-96 flex flex-col p-5 relative overflow-hidden border border-slate-600/30">
                    {/* Browser Chrome */}
                    <div className="flex items-center gap-2 mb-5 pb-4 border-b border-slate-600/20">
                      <div className="w-3 h-3 rounded-full bg-red-500/70" />
                      <div className="w-3 h-3 rounded-full bg-yellow-500/70" />
                      <div className="w-3 h-3 rounded-full bg-green-500/70" />
                      <div className="ml-3 text-xs text-slate-500 font-medium">dashboard.flowerpai.com</div>
                    </div>

                    {/* Dashboard Content Simulation */}
                    <div className="flex-1 space-y-4">
                      {/* KPI Cards Row */}
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-slate-600/30 rounded-lg px-3 py-2.5 border border-slate-600/20 hover:border-slate-500/30 transition-colors">
                          <div className="text-xs font-medium text-slate-400 mb-1.5" style={{ fontFamily: 'var(--font-inter)' }}>Total Orders</div>
                          <div className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>247</div>
                          <div className="text-xs text-green-400/80 mt-1 font-medium">↑ 12% today</div>
                        </div>
                        <div className="bg-slate-600/30 rounded-lg px-3 py-2.5 border border-slate-600/20 hover:border-slate-500/30 transition-colors">
                          <div className="text-xs font-medium text-slate-400 mb-1.5" style={{ fontFamily: 'var(--font-inter)' }}>In Transit</div>
                          <div className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>18</div>
                          <div className="text-xs text-blue-400/80 mt-1 font-medium">On schedule</div>
                        </div>
                        <div className="bg-slate-600/30 rounded-lg px-3 py-2.5 border border-slate-600/20 hover:border-slate-500/30 transition-colors">
                          <div className="text-xs font-medium text-slate-400 mb-1.5" style={{ fontFamily: 'var(--font-inter)' }}>Revenue</div>
                          <div className="text-xl font-bold text-white" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>$48.2k</div>
                          <div className="text-xs text-green-400/80 mt-1 font-medium">+16.1% week</div>
                        </div>
                      </div>

                      {/* Status Indicators */}
                      <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/20">
                        <div className="text-xs font-semibold text-slate-300 mb-3" style={{ fontFamily: 'var(--font-inter)' }}>Active Deliveries</div>
                        <div className="space-y-2 text-xs" style={{ fontFamily: 'var(--font-inter)' }}>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Order #4821 → Downtown Dist.</span>
                            <span className="px-2 py-1 rounded bg-green-500/20 text-green-300 text-xs font-medium">On Time</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Order #4820 → West Terminal</span>
                            <span className="px-2 py-1 rounded bg-blue-500/20 text-blue-300 text-xs font-medium">In Transit</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Order #4819 → Airport</span>
                            <span className="px-2 py-1 rounded bg-yellow-500/20 text-yellow-300 text-xs font-medium">Delayed 8m</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* AI Insight Card */}
                    <div className="mt-3 bg-gradient-to-r from-blue-600/20 to-cyan-600/15 rounded-lg p-2.5 border border-blue-500/25">
                      <div className="flex gap-2 items-start">
                        <Brain className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />
                        <span className="text-xs text-slate-200 font-medium">Route risk: Driver 5 over max daily hours</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Floating Stat Cards */}
                <div className="absolute -left-8 -bottom-8 bg-slate-800/90 border border-slate-700/60 rounded-xl p-4 shadow-2xl shadow-slate-900/50 backdrop-blur-sm hidden sm:block" style={{ fontFamily: 'var(--font-inter)' }}>
                  <div className="text-xs font-medium text-slate-400 mb-1">Active Deliveries</div>
                  <div className="text-2xl font-bold text-white mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>12</div>
                  <div className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                    <TrendingUp className="w-3 h-3" /> 18% up
                  </div>
                </div>

                <div className="absolute -right-8 -top-8 bg-slate-800/90 border border-slate-700/60 rounded-xl p-4 shadow-2xl shadow-slate-900/50 backdrop-blur-sm hidden sm:block" style={{ fontFamily: 'var(--font-inter)' }}>
                  <div className="text-xs font-medium text-slate-400 mb-1">⚠ Needs Attention</div>
                  <div className="text-2xl font-bold text-red-400 mb-2" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>2</div>
                  <div className="text-xs text-slate-400 font-medium">Resolve immediately</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="border-y border-slate-800/30 bg-slate-900/20 py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <p className="text-center text-sm font-medium text-slate-400 mb-6" style={{ fontFamily: 'var(--font-inter)' }}>
            Built for modern logistics operations
          </p>
          <div className="flex flex-wrap justify-center gap-3 sm:gap-5">
            {['Orders', 'Dispatch', 'Fleet', 'Finance', 'AI Insights'].map((badge) => (
              <div
                key={badge}
                className="px-4 py-2.5 rounded-full bg-slate-800/30 border border-slate-700/30 text-sm font-medium text-slate-300 hover:bg-slate-800/50 hover:border-slate-600/40 transition-colors"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                {badge}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Problems Section */}
      <section className="py-24 sm:py-32 relative bg-slate-900/40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-4xl sm:text-5xl font-bold text-center mb-4 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            Logistics Gets Hard When Everything Lives in Different Tools
          </h2>
          <p className="text-center text-slate-400 mb-16 max-w-2xl mx-auto text-lg" style={{ fontFamily: 'var(--font-inter)' }}>
            Disconnected systems create delays, missed opportunities, and manual errors. Here's what we hear from logistics teams:
          </p>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8 mb-16">
            {[
              {
                title: 'Orders get lost',
                desc: 'Shipment details are scattered across spreadsheets, calls, and chat messages.',
                icon: Package,
                accent: 'from-orange-500/20 to-orange-600/20',
                borderColor: 'border-orange-500/20',
                iconColor: 'text-orange-400',
              },
              {
                title: 'Dispatch becomes reactive',
                desc: 'Teams struggle to assign the right driver and vehicle at the right time.',
                icon: MapPin,
                accent: 'from-amber-500/20 to-orange-500/20',
                borderColor: 'border-amber-500/20',
                iconColor: 'text-amber-400',
              },
              {
                title: 'Finance lacks visibility',
                desc: 'Invoices, payments, and profitability are difficult to track in real time.',
                icon: DollarSign,
                accent: 'from-red-500/20 to-rose-600/20',
                borderColor: 'border-red-500/20',
                iconColor: 'text-red-400',
              },
            ].map((problem, idx) => (
              <div
                key={idx}
                className={`bg-gradient-to-br ${problem.accent} border ${problem.borderColor} rounded-xl p-7 sm:p-8 hover:border-opacity-50 transition-colors group`}
              >
                <div className={`w-10 h-10 rounded-lg bg-gradient-to-br ${problem.accent} border ${problem.borderColor} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                  <problem.icon className={`w-6 h-6 ${problem.iconColor}`} />
                </div>
                <h3
                  className="text-xl font-bold mb-2 text-slate-100"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  {problem.title}
                </h3>
                <p className="text-slate-400 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                  {problem.desc}
                </p>
              </div>
            ))}
          </div>

          {/* Transition */}
          <div className="text-center">
            <div className="inline-block mb-6">
              <ArrowRight className="w-6 h-6 text-blue-400 transform rotate-90" />
            </div>
            <p
              className="text-2xl font-bold text-slate-100"
              style={{ fontFamily: 'var(--font-manrope)' }}
            >
              FlowERP brings your entire operation into one connected system
            </p>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="product" className="py-24 sm:py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/40 via-transparent to-slate-950 -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-4xl sm:text-5xl font-bold text-center mb-4 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            Everything Your Logistics Team Needs — Connected
          </h2>
          <p className="text-center text-slate-400 mb-16 max-w-2xl mx-auto text-lg" style={{ fontFamily: 'var(--font-inter)' }}>
            From order to payment, manage every aspect of your logistics operation in one intelligent platform.
          </p>

          {/* Features Grid - Premium Bento */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 auto-rows-fr">
            {/* Feature 1 - Large with visual preview */}
            <div className="lg:col-span-2 bg-slate-800/30 border border-slate-700/30 rounded-2xl p-8 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group">
              <div className="flex items-start gap-5 mb-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <Package className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3
                    className="text-2xl font-bold mb-2 text-white"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    Order Management
                  </h3>
                </div>
              </div>
              <p className="text-slate-300 leading-relaxed mb-5" style={{ fontFamily: 'var(--font-inter)' }}>
                Create, organize, and monitor every shipment from pickup to delivery. Attach documents, set special instructions, and track payment status.
              </p>
              {/* Mini preview */}
              <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/20">
                <div className="text-xs font-medium text-slate-400 mb-2">Recent Orders</div>
                <div className="space-y-1.5 text-xs">
                  <div className="flex justify-between"><span className="text-slate-400">#4821</span><span className="text-green-400">Delivered</span></div>
                  <div className="flex justify-between"><span className="text-slate-400">#4820</span><span className="text-blue-400">In Transit</span></div>
                </div>
              </div>
            </div>

            {/* Feature 2 */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-8 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mb-4 group-hover:scale-110 transition-transform">
                <MapPin className="w-6 h-6 text-blue-400" />
              </div>
              <h3
                className="text-xl font-bold mb-2 text-white"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                Smart Dispatch
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                Assign drivers and vehicles faster with a clear dispatch board. See availability in real time.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-700/30">
                <div className="text-xs font-medium text-slate-400 mb-1">Available now</div>
                <div className="text-sm font-semibold text-green-400">8 drivers</div>
              </div>
            </div>

            {/* Feature 3 */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-8 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mb-4 group-hover:scale-110 transition-transform">
                <Activity className="w-6 h-6 text-blue-400" />
              </div>
              <h3
                className="text-xl font-bold mb-2 text-white"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                Live Tracking
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                Know where every shipment is. Catch delays before they become problems.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-700/30">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-500" />
                  <span className="text-xs font-medium text-slate-400">Real-time GPS</span>
                </div>
              </div>
            </div>

            {/* Feature 4 */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-8 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 mb-4 group-hover:scale-110 transition-transform">
                <Truck className="w-6 h-6 text-blue-400" />
              </div>
              <h3
                className="text-xl font-bold mb-2 text-white"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                Fleet Management
              </h3>
              <p className="text-slate-400 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                Manage drivers, vehicles, availability, and delivery workloads in one place.
              </p>
              <div className="mt-4 pt-4 border-t border-slate-700/30">
                <div className="text-xs font-medium text-slate-400 mb-1">Fleet status</div>
                <div className="text-sm font-semibold text-white">24 vehicles active</div>
              </div>
            </div>

            {/* Feature 5 - Large with visual preview */}
            <div className="lg:col-span-2 bg-slate-800/30 border border-slate-700/30 rounded-2xl p-8 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group">
              <div className="flex items-start gap-5 mb-4">
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform">
                  <DollarSign className="w-6 h-6 text-blue-400" />
                </div>
                <div className="flex-1">
                  <h3
                    className="text-2xl font-bold mb-2 text-white"
                    style={{ fontFamily: 'var(--font-manrope)' }}
                  >
                    Finance Control
                  </h3>
                </div>
              </div>
              <p className="text-slate-300 leading-relaxed mb-5" style={{ fontFamily: 'var(--font-inter)' }}>
                Generate invoices automatically, track payments, monitor outstanding balances, and analyze operational profitability per order, customer, or vehicle.
              </p>
              {/* Mini preview */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/20">
                  <div className="text-xs font-medium text-slate-400 mb-1">Revenue Today</div>
                  <div className="text-lg font-bold text-green-400" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>$3,240</div>
                </div>
                <div className="bg-slate-700/30 rounded-lg p-3 border border-slate-600/20">
                  <div className="text-xs font-medium text-slate-400 mb-1">Outstanding</div>
                  <div className="text-lg font-bold text-amber-400" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>$12,500</div>
                </div>
              </div>
            </div>

            {/* Feature 6 - AI */}
            <div className="bg-gradient-to-br from-blue-600/20 via-blue-500/10 to-cyan-600/10 border border-blue-500/25 rounded-2xl p-8 hover:border-blue-500/40 hover:from-blue-600/25 transition-all group">
              <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/30 to-cyan-500/20 border border-blue-500/30 flex items-center justify-center flex-shrink-0 mb-4 group-hover:scale-110 transition-transform">
                <Brain className="w-6 h-6 text-blue-300" />
              </div>
              <h3
                className="text-xl font-bold mb-2 text-white"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                AI Assistant
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                Ask about delayed deliveries, unpaid invoices, driver workload, or revenue trends — get instant insights.
              </p>
              <div className="mt-4 pt-4 border-t border-blue-500/20">
                <div className="text-xs text-blue-300 font-medium">Available 24/7</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Workflow Section */}
      <section id="how-it-works" className="py-24 sm:py-32 relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-4xl sm:text-5xl font-bold text-center mb-4 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            From New Order to Paid Invoice — One Clear Workflow
          </h2>
          <p className="text-center text-slate-400 mb-16 max-w-2xl mx-auto text-lg" style={{ fontFamily: 'var(--font-inter)' }}>
            A streamlined process that keeps your team aligned and customers informed every step of the way.
          </p>

          {/* Desktop Workflow */}
          <div className="hidden sm:block">
            <div className="grid grid-cols-5 gap-3 items-end">
              {[
                { step: '01', title: 'Create Order', icon: Package, desc: 'Register order details' },
                { step: '02', title: 'Assign Driver', icon: Truck, desc: 'Select vehicle & driver' },
                { step: '03', title: 'Track Delivery', icon: MapPin, desc: 'Monitor progress' },
                { step: '04', title: 'Generate Invoice', icon: DollarSign, desc: 'Auto bill customer' },
                { step: '05', title: 'Monitor Performance', icon: BarChart3, desc: 'View analytics' },
              ].map((step, idx) => (
                <div key={idx} className="relative">
                  {/* Connecting line */}
                  {idx < 4 && (
                    <div className="absolute top-16 left-[60%] right-[-30%] h-0.5 bg-gradient-to-r from-blue-500/40 to-transparent -z-10" />
                  )}

                  <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5 sm:p-6 text-center hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group">
                    {/* Step badge */}
                    <div className="inline-flex items-center justify-center w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 mb-3 group-hover:scale-110 transition-transform">
                      <span className="text-xs font-bold text-blue-300" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                        {step.step}
                      </span>
                    </div>

                    <step.icon className="w-6 h-6 text-blue-400 mx-auto mb-3" />
                    <p
                      className="text-base font-bold text-white mb-1"
                      style={{ fontFamily: 'var(--font-manrope)' }}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-inter)' }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Mobile Workflow */}
          <div className="sm:hidden space-y-3">
            {[
              { step: '01', title: 'Create Order', icon: Package, desc: 'Register order details' },
              { step: '02', title: 'Assign Driver', icon: Truck, desc: 'Select vehicle & driver' },
              { step: '03', title: 'Track Delivery', icon: MapPin, desc: 'Monitor progress' },
              { step: '04', title: 'Generate Invoice', icon: DollarSign, desc: 'Auto bill customer' },
              { step: '05', title: 'Monitor Performance', icon: BarChart3, desc: 'View analytics' },
            ].map((step, idx) => (
              <div key={idx}>
                <div className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-4 flex items-start gap-4 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-blue-300" style={{ fontFamily: 'var(--font-jetbrains-mono)' }}>
                      {step.step}
                    </span>
                  </div>
                  <div className="flex-1">
                    <p
                      className="text-sm font-bold text-white"
                      style={{ fontFamily: 'var(--font-manrope)' }}
                    >
                      {step.title}
                    </p>
                    <p className="text-xs text-slate-400" style={{ fontFamily: 'var(--font-inter)' }}>
                      {step.desc}
                    </p>
                  </div>
                </div>
                {idx < 4 && (
                  <div className="flex justify-center py-1">
                    <ChevronDown className="w-4 h-4 text-slate-700" />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-24 sm:py-32 relative bg-slate-900/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-4xl sm:text-5xl font-bold text-center mb-16 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            Built for Teams That Need Control, Not More Complexity
          </h2>

          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {[
              'Faster dispatch decisions',
              'Fewer missed updates',
              'Clearer payment tracking',
              'Real-time operational visibility',
              'Better driver and fleet utilization',
              'One source of truth for the entire team',
            ].map((benefit, idx) => (
              <div
                key={idx}
                className="bg-slate-800/30 border border-slate-700/30 rounded-xl p-5 sm:p-6 flex items-start gap-3 hover:border-slate-600/50 hover:bg-slate-800/40 transition-colors group"
              >
                <CheckCircle2 className="w-5 h-5 text-green-400 flex-shrink-0 mt-0.5 group-hover:scale-110 transition-transform" />
                <span className="text-slate-300 font-medium" style={{ fontFamily: 'var(--font-inter)' }}>
                  {benefit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Role-Based Section */}
      <section className="py-24 sm:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-4xl sm:text-5xl font-bold text-center mb-16 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            One Platform. Clear Value for Every Team
          </h2>

          <div className="grid md:grid-cols-3 gap-6 lg:gap-8">
            {[
              {
                title: 'Operations Managers',
                icon: Truck,
                benefits: [
                  'Monitor active orders at a glance',
                  'Dispatch faster with real-time visibility',
                  'Resolve delays early before they impact customers',
                ],
              },
              {
                title: 'Finance Teams',
                icon: DollarSign,
                benefits: [
                  'Track invoices and payments in real time',
                  'See revenue and outstanding balances',
                  'Improve profitability visibility per order and customer',
                ],
              },
              {
                title: 'Business Owners',
                icon: BarChart3,
                benefits: [
                  'See performance metrics in one dashboard',
                  'Make data-driven decisions with AI insights',
                  'Scale operations with full control and visibility',
                ],
              },
            ].map((role, idx) => (
              <div
                key={idx}
                className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-8 hover:border-slate-600/50 hover:bg-slate-800/40 transition-all group"
              >
                <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-500/20 to-blue-600/10 border border-blue-500/20 flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <role.icon className="w-6 h-6 text-blue-400" />
                </div>
                <h3
                  className="text-xl font-bold mb-6 text-white"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  {role.title}
                </h3>
                <ul className="space-y-4">
                  {role.benefits.map((benefit, bidx) => (
                    <li key={bidx} className="flex gap-3 items-start">
                      <CheckCircle2 className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                      <span className="text-slate-300 text-sm leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI Section */}
      <section className="py-24 sm:py-32 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-blue-600/10 via-slate-950 to-slate-950 -z-10" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-16 items-center">
            <div>
              <h2
                className="text-4xl sm:text-5xl font-bold mb-6 text-white"
                style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
              >
                Your Logistics Data Can Now Answer Back
              </h2>
              <p className="text-lg text-slate-300 mb-8 leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                FlowERP AI turns operational data into clear answers. Ask about delayed deliveries, unpaid invoices, driver workload, or revenue performance — and get useful insights in seconds.
              </p>

              <div className="space-y-3 mb-10">
                {[
                  'Which deliveries are delayed today?',
                  'Show unpaid invoices over 7 days.',
                  'Which drivers have the highest workload?',
                  'What caused revenue to drop this week?',
                ].map((prompt, idx) => (
                  <div
                    key={idx}
                    className="flex items-center gap-3 text-slate-300 group"
                  >
                    <MessageSquare className="w-5 h-5 text-blue-400 flex-shrink-0 group-hover:scale-110 transition-transform" />
                    <span className="text-sm font-medium" style={{ fontFamily: 'var(--font-inter)' }}>
                      {prompt}
                    </span>
                  </div>
                ))}
              </div>

              <button
                onClick={() => setDemoModalOpen(true)}
                className="px-6 py-3 rounded-lg border border-blue-500/50 hover:border-blue-500 hover:bg-blue-500/10 text-blue-400 hover:text-blue-300 font-semibold transition flex items-center gap-2"
                style={{ fontFamily: 'var(--font-inter)' }}
              >
                See AI in Action
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* AI Chat Preview */}
            <div className="bg-slate-800/30 border border-slate-700/30 rounded-2xl p-6 backdrop-blur-sm hover:border-slate-600/50 transition-colors">
              <div className="bg-slate-700/20 rounded-xl p-4 h-72 flex flex-col space-y-3 border border-slate-700/20">
                {/* Chat message */}
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0 border border-blue-500/30">
                    <Brain className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="bg-blue-600/15 border border-blue-500/20 rounded-lg p-3 flex-1">
                    <p className="text-sm text-slate-100 font-medium" style={{ fontFamily: 'var(--font-inter)' }}>
                      You have 3 delayed deliveries. Route risk: Driver 5 over max hours.
                    </p>
                  </div>
                </div>

                {/* Chat message */}
                <div className="flex gap-2 flex-row-reverse">
                  <div className="w-8 h-8 rounded-full bg-slate-600/30 flex items-center justify-center flex-shrink-0 border border-slate-600/30">
                    <Users className="w-4 h-4 text-slate-400" />
                  </div>
                  <div className="bg-slate-700/20 border border-slate-600/20 rounded-lg p-3 flex-1">
                    <p className="text-sm text-slate-300 font-medium" style={{ fontFamily: 'var(--font-inter)' }}>
                      Show unpaid invoices over 7 days
                    </p>
                  </div>
                </div>

                {/* Chat message */}
                <div className="flex gap-2">
                  <div className="w-8 h-8 rounded-full bg-blue-600/30 flex items-center justify-center flex-shrink-0 border border-blue-500/30">
                    <Brain className="w-4 h-4 text-blue-400" />
                  </div>
                  <div className="bg-blue-600/15 border border-blue-500/20 rounded-lg p-3 flex-1">
                    <p className="text-sm text-slate-100 font-medium mb-2" style={{ fontFamily: 'var(--font-inter)' }}>
                      4 unpaid invoices totaling:
                    </p>
                    <div className="text-xs text-slate-400 space-y-1.5">
                      <div className="flex justify-between">
                        <span style={{ fontFamily: 'var(--font-inter)' }}>Invoice #424</span>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }} className="text-amber-400">$2,100</span>
                      </div>
                      <div className="flex justify-between">
                        <span style={{ fontFamily: 'var(--font-inter)' }}>Invoice #421</span>
                        <span style={{ fontFamily: 'var(--font-jetbrains-mono)' }} className="text-amber-400">$1,850</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Input */}
                <div className="flex gap-2 mt-auto pt-3 border-t border-slate-700/20">
                  <input
                    type="text"
                    placeholder="Ask FlowERP..."
                    className="flex-1 bg-slate-700/20 border border-slate-600/20 rounded-lg px-3 py-2 text-xs text-slate-300 placeholder-slate-500 font-medium"
                    style={{ fontFamily: 'var(--font-inter)' }}
                    disabled
                  />
                  <button className="px-3 py-2 bg-blue-600/30 hover:bg-blue-600/50 rounded-lg text-slate-300 hover:text-blue-300 border border-blue-500/20 transition disabled:opacity-50">
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-24 sm:py-32 relative">
        <div className="absolute inset-0 bg-gradient-to-b from-slate-900/50 to-blue-600/5 -z-10" />

        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2
            className="text-4xl sm:text-5xl font-bold mb-6 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            See How FlowERP Can Simplify Your Logistics Operations
          </h2>
          <p className="text-lg text-slate-300 mb-12 leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
            Book a free consultation and we'll walk you through how FlowERP can fit your dispatch, fleet, finance, and reporting workflow.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
            <button
              onClick={() => setDemoModalOpen(true)}
              className="px-8 py-3.5 rounded-lg bg-gradient-to-r from-blue-500 via-blue-500 to-blue-600 hover:from-blue-600 hover:via-blue-600 hover:to-blue-700 text-white font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30 transform hover:translate-y-px flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--font-inter)' }}
            >
              Book a Free Demo
              <Calendar className="w-4 h-4" />
            </button>
            <a
              href="mailto:sales@flowerpai.com"
              className="px-8 py-3.5 rounded-lg border border-slate-700/60 hover:border-slate-600/80 hover:bg-slate-800/40 text-slate-300 hover:text-white font-semibold transition-colors flex items-center justify-center gap-2"
              style={{ fontFamily: 'var(--font-inter)' }}
            >
              Talk to Our Team
              <MessageSquare className="w-4 h-4" />
            </a>
          </div>

          <div className="grid sm:grid-cols-3 gap-4 max-w-2xl mx-auto">
            {[
              'Personalized walkthrough',
              'No obligation',
              'Response within 24 hours',
            ].map((point, idx) => (
              <div key={idx} className="text-sm font-medium text-slate-400" style={{ fontFamily: 'var(--font-inter)' }}>
                ✓ {point}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-24 sm:py-32">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2
            className="text-4xl sm:text-5xl font-bold text-center mb-16 text-white"
            style={{ fontFamily: 'var(--font-manrope)', letterSpacing: '-0.02em' }}
          >
            Frequently Asked Questions
          </h2>

          <div className="space-y-3">
            {[
              {
                q: 'Who is FlowERP for?',
                a: 'FlowERP is designed for logistics companies of any size — from owner-operated to enterprise. If you manage orders, drivers, vehicles, and payments, FlowERP fits your workflow.',
              },
              {
                q: 'Can FlowERP support multiple branches or organizations?',
                a: 'Yes. Users can belong to multiple workspaces and switch between them. This is perfect for managing multiple branches or partner operations.',
              },
              {
                q: 'Can I manage drivers and vehicles?',
                a: 'Yes, fully. Create driver profiles, assign vehicles, manage availability, track workload, and monitor performance from one central place.',
              },
              {
                q: 'Does FlowERP include invoice and payment tracking?',
                a: 'Yes. Automatically generate invoices from orders, track payments, monitor outstanding balances, and see your profitability in real time.',
              },
              {
                q: 'Can the platform be customized for our workflow?',
                a: 'FlowERP is built to be flexible. During onboarding, we work with you to understand your workflow and configure the platform to match your needs.',
              },
              {
                q: 'Is onboarding and support included?',
                a: 'Yes. We provide setup support, documentation, and training to get your team up and running. Our support team is available to help you succeed.',
              },
              {
                q: 'How do I request a demo?',
                a: 'Click "Book a Demo" on this page, fill in your details, and our team will contact you within 24 hours. You can also email sales@flowerpai.com.',
              },
            ].map((faq, idx) => (
              <div
                key={idx}
                className="border border-slate-700/30 rounded-xl overflow-hidden transition-colors hover:border-slate-600/50"
              >
                <button
                  onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}
                  className="w-full bg-slate-800/30 hover:bg-slate-800/40 px-6 py-4 flex justify-between items-center transition-colors group"
                  style={{ fontFamily: 'var(--font-inter)' }}
                >
                  <span className="font-semibold text-left text-slate-100 group-hover:text-white transition-colors">
                    {faq.q}
                  </span>
                  <ChevronDown
                    className={`w-5 h-5 text-slate-400 flex-shrink-0 transition-transform ${
                      expandedFaq === idx ? 'rotate-180' : ''
                    }`}
                  />
                </button>
                {expandedFaq === idx && (
                  <div className="bg-slate-800/20 px-6 py-4 text-slate-400 border-t border-slate-700/30" style={{ fontFamily: 'var(--font-inter)' }}>
                    <p className="leading-relaxed">{faq.a}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800/40 py-16 sm:py-20 mt-24 sm:mt-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-12 mb-12">
            <div>
              <div className="flex items-center gap-2.5 mb-5">
                <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-400 to-cyan-400 flex items-center justify-center flex-shrink-0">
                  <Zap className="w-4 h-4 text-slate-950" />
                </div>
                <span
                  className="text-base font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  FlowERP AI
                </span>
              </div>
              <p className="text-sm text-slate-400 leading-relaxed" style={{ fontFamily: 'var(--font-inter)' }}>
                AI-powered logistics operations platform for modern companies.
              </p>
            </div>

            <div>
              <h4
                className="font-bold text-white mb-5 text-sm"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                Product
              </h4>
              <ul className="space-y-3 text-sm" style={{ fontFamily: 'var(--font-inter)' }}>
                <li>
                  <a href="#product" className="text-slate-400 hover:text-white transition-colors font-medium">
                    Features
                  </a>
                </li>
                <li>
                  <a href="#how-it-works" className="text-slate-400 hover:text-white transition-colors font-medium">
                    How It Works
                  </a>
                </li>
                <li>
                  <a href="#faq" className="text-slate-400 hover:text-white transition-colors font-medium">
                    FAQ
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4
                className="font-bold text-white mb-5 text-sm"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                Company
              </h4>
              <ul className="space-y-3 text-sm" style={{ fontFamily: 'var(--font-inter)' }}>
                <li>
                  <a href="mailto:sales@flowerpai.com" className="text-slate-400 hover:text-white transition-colors font-medium">
                    Sales
                  </a>
                </li>
                <li>
                  <a href="mailto:support@flowerpai.com" className="text-slate-400 hover:text-white transition-colors font-medium">
                    Support
                  </a>
                </li>
              </ul>
            </div>

            <div>
              <h4
                className="font-bold text-white mb-5 text-sm"
                style={{ fontFamily: 'var(--font-manrope)' }}
              >
                Access
              </h4>
              <ul className="space-y-3 text-sm" style={{ fontFamily: 'var(--font-inter)' }}>
                <li>
                  <Link href="/auth/login" className="text-slate-400 hover:text-white transition-colors font-medium">
                    Sign In
                  </Link>
                </li>
                <li>
                  <button
                    onClick={() => setDemoModalOpen(true)}
                    className="text-slate-400 hover:text-white transition-colors font-medium"
                  >
                    Request Demo
                  </button>
                </li>
              </ul>
            </div>
          </div>

          <div className="border-t border-slate-800/40 pt-8">
            <div className="flex flex-col sm:flex-row justify-between items-center gap-4 text-sm text-slate-400" style={{ fontFamily: 'var(--font-inter)' }}>
              <p>&copy; {new Date().getFullYear()} FlowERP. All rights reserved.</p>
              <div className="flex gap-2 items-center">
                <span className="font-medium">Built by</span>
                <a
                  href="https://itechnology.uz/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300 transition-colors font-semibold"
                >
                  iTechnology
                </a>
              </div>
            </div>
          </div>
        </div>
      </footer>

      {/* Demo Form Modal */}
      {demoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => !formSubmitting && setDemoModalOpen(false)}
          />

          {/* Modal */}
          <div className="relative bg-slate-900 border border-slate-700/40 rounded-2xl p-6 sm:p-8 max-w-md w-full shadow-2xl shadow-slate-900/50">
            <button
              onClick={() => !formSubmitting && setDemoModalOpen(false)}
              className="absolute top-4 right-4 p-2 text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>

            {!formSubmitted ? (
              <>
                <h3
                  className="text-2xl font-bold mb-2 text-white"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  Request a Demo
                </h3>
                <p className="text-slate-400 mb-6" style={{ fontFamily: 'var(--font-inter)' }}>
                  Our team will walk you through FlowERP. No credit card required.
                </p>

                <form onSubmit={handleFormSubmit} className="space-y-4" style={{ fontFamily: 'var(--font-inter)' }}>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Full Name *
                    </label>
                    <input
                      type="text"
                      name="fullName"
                      value={formData.fullName}
                      onChange={handleFormChange}
                      placeholder="Your name"
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:border-blue-500/60 focus:bg-slate-800 focus:outline-none transition"
                      disabled={formSubmitting}
                    />
                    {formErrors.fullName && (
                      <p className="text-red-400 text-xs mt-1.5">{formErrors.fullName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Work Email *
                    </label>
                    <input
                      type="email"
                      name="workEmail"
                      value={formData.workEmail}
                      onChange={handleFormChange}
                      placeholder="you@company.com"
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:border-blue-500/60 focus:bg-slate-800 focus:outline-none transition"
                      disabled={formSubmitting}
                    />
                    {formErrors.workEmail && (
                      <p className="text-red-400 text-xs mt-1.5">{formErrors.workEmail}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Company Name *
                    </label>
                    <input
                      type="text"
                      name="companyName"
                      value={formData.companyName}
                      onChange={handleFormChange}
                      placeholder="Your company"
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:border-blue-500/60 focus:bg-slate-800 focus:outline-none transition"
                      disabled={formSubmitting}
                    />
                    {formErrors.companyName && (
                      <p className="text-red-400 text-xs mt-1.5">{formErrors.companyName}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Phone / WhatsApp *
                    </label>
                    <input
                      type="tel"
                      name="phone"
                      value={formData.phone}
                      onChange={handleFormChange}
                      placeholder="+1 (555) 000-0000"
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:border-blue-500/60 focus:bg-slate-800 focus:outline-none transition"
                      disabled={formSubmitting}
                    />
                    {formErrors.phone && (
                      <p className="text-red-400 text-xs mt-1.5">{formErrors.phone}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Number of Vehicles (optional)
                    </label>
                    <input
                      type="text"
                      name="vehicles"
                      value={formData.vehicles}
                      onChange={handleFormChange}
                      placeholder="e.g., 15"
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:border-blue-500/60 focus:bg-slate-800 focus:outline-none transition"
                      disabled={formSubmitting}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-2">
                      Tell us about your challenge (optional)
                    </label>
                    <textarea
                      name="message"
                      value={formData.message}
                      onChange={handleFormChange}
                      placeholder="What logistics challenges are you facing?"
                      rows={3}
                      className="w-full px-4 py-2.5 rounded-lg bg-slate-800/50 border border-slate-700/50 text-white placeholder-slate-500 focus:border-blue-500/60 focus:bg-slate-800 focus:outline-none transition resize-none"
                      disabled={formSubmitting}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={formSubmitting}
                    className="w-full py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30 disabled:opacity-50 disabled:cursor-not-allowed transform hover:translate-y-px"
                  >
                    {formSubmitting ? 'Sending...' : 'Request My Demo'}
                  </button>
                </form>

                <p className="text-xs text-slate-500 text-center mt-4" style={{ fontFamily: 'var(--font-inter)' }}>
                  We'll respond within 24 hours. Your data is secure with us.
                </p>
              </>
            ) : (
              <div className="text-center py-8">
                <div className="w-12 h-12 rounded-full bg-green-500/20 border border-green-500/40 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-6 h-6 text-green-400" />
                </div>
                <h3
                  className="text-xl font-bold mb-2 text-white"
                  style={{ fontFamily: 'var(--font-manrope)' }}
                >
                  Thank You!
                </h3>
                <p className="text-slate-400 text-sm mb-6" style={{ fontFamily: 'var(--font-inter)' }}>
                  Your demo request has been submitted. Our team will contact you within 24 hours.
                </p>
                <button
                  onClick={() => setDemoModalOpen(false)}
                  className="px-6 py-2.5 rounded-lg bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white text-sm font-semibold transition-all hover:shadow-lg hover:shadow-blue-500/30"
                  style={{ fontFamily: 'var(--font-inter)' }}
                >
                  Close
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
