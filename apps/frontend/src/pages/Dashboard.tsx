// apps/frontend/src/pages/Dashboard.tsx
import { Link } from 'react-router-dom'
import { useWeaves } from '../api/client'
import { format } from 'date-fns'
import { Activity, Shield, FileText, Sparkles } from 'lucide-react'
import { browserLogger as logger } from '@regloom/utils/browser'

export default function Dashboard() {
    const { data: weaves = [], isLoading } = useWeaves()

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50">
            <div className="container mx-auto px-6 py-10">
                {/* Hero Header */}
                <div className="text-center mb-12">
                    <h1 className="text-5xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent mb-4">
                        RegLoom
                    </h1>
                    <p className="text-xl text-gray-600">Weave compliant, AI-ready datasets in seconds</p>
                </div>

                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-12">
                    <div className="card">
                        <Shield className="w-10 h-10 text-green-500 mb-3" />
                        <p className="text-3xl font-bold">100%</p>
                        <p className="text-gray-600">Compliance Rate</p>
                    </div>
                    <div className="card">
                        <Activity className="w-10 h-10 text-blue-500 mb-3" />
                        <p className="text-3xl font-bold">{weaves.length}</p>
                        <p className="text-gray-600">Weaves Completed</p>
                    </div>
                    <div className="card">
                        <Sparkles className="w-10 h-10 text-purple-500 mb-3" />
                        <p className="text-3xl font-bold">2.4×</p>
                        <p className="text-gray-600">Synthetic Boost</p>
                    </div>
                    <div className="card">
                        <FileText className="w-10 h-10 text-indigo-500 mb-3" />
                        <p className="text-3xl font-bold">150+</p>
                        <p className="text-gray-600">Regulations Covered</p>
                    </div>
                </div>

                {/* CTA + Recent Weaves */}
                <div className="text-center mb-12">
                    <Link to="/weave" className="btn-primary inline-flex items-center gap-3 text-lg">
                        <Sparkles className="w-6 h-6" />
                        Start New Weave
                    </Link>
                </div>

                {/* Recent Weaves */}
                <div className="max-w-4xl mx-auto">
                    <h2 className="text-2xl font-semibold mb-6">Recent Weaves</h2>
                    {isLoading ? (
                        <p className="text-center py-10 text-gray-500">Loading weaves...</p>
                    ) : weaves.length === 0 ? (
                        <p className="text-center py-10 text-gray-500">No weaves yet. Start your first one!</p>
                    ) : (
                        <div className="space-y-4">
                            {weaves.slice(0, 5).map((weave) => (
                                <div key={weave.metadata.weaveId} className="card flex justify-between items-center">
                                    <div>
                                        <p className="font-medium">Weave #{weave.metadata.weaveId.slice(0, 8)}</p>
                                        <p className="text-sm text-gray-500">
                                            {format(new Date(weave.metadata.generatedAt), 'PPP p')}
                                        </p>
                                    </div>
                                    <span className={`px-4 py-2 rounded-full text-sm font-medium ${weave.metadata.complianceReport.compliant
                                            ? 'bg-green-100 text-green-800'
                                            : 'bg-red-100 text-red-800'
                                        }`}>
                                        {weave.metadata.complianceReport.compliant ? 'Compliant' : 'Needs Review'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}