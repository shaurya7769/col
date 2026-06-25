import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';
import StatCard from '../components/shared/StatCard';
import { Users, ChevronLeft, Calendar, MapPin, UserPlus, Trash2, X, Download } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, ResponsiveContainer } from 'recharts';
import { toast } from 'react-hot-toast';

const fetchBatchDetail = async (id) => {
  const { data } = await api.get(`/batches/${id}`);
  return data.data;
};

const enrollStudent = async ({ batchId, studentId }) => {
  await api.post(`/batches/${batchId}/enroll`, { studentId });
};

const unenrollStudent = async ({ batchId, studentId }) => {
  await api.delete(`/batches/${batchId}/unenroll/${studentId}`);
};

// Simulated attendance data for the chart (since we don't have an attendance table)
const MOCK_ATTENDANCE_DATA = [
  { week: 'Week 1', attendance: 85 },
  { week: 'Week 2', attendance: 90 },
  { week: 'Week 3', attendance: 82 },
  { week: 'Week 4', attendance: 95 },
];

const BatchDetailPage = () => {
  const { batchId } = useParams();
  const queryClient = useQueryClient();
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [studentIdToEnroll, setStudentIdToEnroll] = useState('');

  const { data: batch, isLoading } = useQuery({
    queryKey: ['batch', batchId],
    queryFn: () => fetchBatchDetail(batchId),
    enabled: !!batchId,
  });

  const enrollMutation = useMutation({
    mutationFn: enrollStudent,
    onSuccess: () => {
      toast.success('Student enrolled!');
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] });
      setShowEnrollModal(false);
      setStudentIdToEnroll('');
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Enrollment failed'),
  });

  const unenrollMutation = useMutation({
    mutationFn: unenrollStudent,
    onSuccess: () => {
      toast.success('Student removed from batch.');
      queryClient.invalidateQueries({ queryKey: ['batch', batchId] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Removal failed'),
  });

  const handleDownloadReport = () => {
    if (!batch?.students || batch.students.length === 0) {
      return toast.error('No students to export.');
    }
    
    // Simple CSV Generation
    const headers = ['Student Name', 'Enrollment Date', 'Status'];
    const rows = batch.students.map(s => [
      s.username,
      new Date(s.enrolled_at).toLocaleDateString(),
      'Active'
    ]);
    
    const csvContent = "data:text/csv;charset=utf-8," 
      + headers.join(",") + "\n" 
      + rows.map(e => e.join(",")).join("\n");
      
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `batch_report_${batch.name.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report downloaded');
  };

  if (isLoading) return <div className="main-content">Loading batch intelligence...</div>;

  return (
    <div className="dashboard animate-fade-in">
      {showEnrollModal && (
        <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && setShowEnrollModal(false)}>
          <div className="modal">
            <div className="modal-header">
              <h2 className="modal-title">Enroll Student</h2>
              <button className="modal-close" onClick={() => setShowEnrollModal(false)}><X size={20} /></button>
            </div>
            <form onSubmit={(e) => {
              e.preventDefault();
              if(!studentIdToEnroll) return;
              enrollMutation.mutate({ batchId, studentId: studentIdToEnroll });
            }}>
              <div className="form-group">
                <label>Student UUID</label>
                <input 
                  className="form-input" 
                  placeholder="Enter student ID" 
                  value={studentIdToEnroll} 
                  onChange={(e) => setStudentIdToEnroll(e.target.value)}
                  required 
                />
                <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                  In a full system, you'd have a searchable dropdown here.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
                <button type="submit" className="btn btn--primary" style={{ flex: 1, justifyContent: 'center' }} disabled={enrollMutation.isPending}>
                  {enrollMutation.isPending ? 'Enrolling...' : 'Enroll'}
                </button>
                <button type="button" className="btn btn--ghost" onClick={() => setShowEnrollModal(false)}>Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      <nav style={{ marginBottom: '24px' }}>
        <Link to="/coach" style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--color-text-muted)', textDecoration: 'none', fontSize: '0.875rem' }}>
          <ChevronLeft size={16} /> Back to Dashboard
        </Link>
      </nav>

      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '2.5rem', fontWeight: 900 }}>{batch?.name}</h1>
          <p style={{ color: 'var(--color-text-muted)', marginTop: '8px' }}>{batch?.description}</p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn--ghost" onClick={handleDownloadReport}>
            <Download size={18} /> Export
          </button>
          <button className="btn btn--primary" onClick={() => setShowEnrollModal(true)}>
            <UserPlus size={18} /> Enroll Student
          </button>
        </div>
      </div>
      
      <div className="stat-grid">
        {/* Info Card */}
        <div className="glass-card animate-fade-in" style={{ animationDelay: '0.1s' }}>
          <header style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <MapPin size={18} color="var(--color-accent)" />
            <span className="stat-label">Location & Time</span>
          </header>
          <div className="stat-value" style={{ fontSize: '1.5rem' }}>{batch?.venue}</div>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>{batch?.schedule}</p>
        </div>

        {/* Analytics Card */}
        <div className="glass-card animate-fade-in" style={{ animationDelay: '0.2s', gridColumn: 'span 2' }}>
           <h3 style={{ fontSize: '0.875rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--color-text-muted)', fontWeight: 700, marginBottom: '16px' }}>
             Attendance Trend (Last 4 Weeks)
           </h3>
           <div style={{ height: '180px' }}>
             <ResponsiveContainer width="100%" height="100%">
               <LineChart data={MOCK_ATTENDANCE_DATA}>
                 <Line type="monotone" dataKey="attendance" stroke="var(--color-accent)" strokeWidth={3} dot={{ r: 4, fill: "var(--color-bg)", strokeWidth: 2 }} />
                 <CartesianGrid stroke="var(--color-border)" strokeDasharray="5 5" vertical={false} />
                 <XAxis dataKey="week" stroke="var(--color-text-muted)" tickLine={false} axisLine={false} />
                 <YAxis stroke="var(--color-text-muted)" tickLine={false} axisLine={false} domain={['dataMin - 10', 'dataMax + 5']} />
                 <RechartsTooltip 
                   contentStyle={{ backgroundColor: 'var(--color-surface)', borderColor: 'var(--color-border)', borderRadius: '8px' }}
                   itemStyle={{ color: 'var(--color-text-primary)' }}
                   formatter={(val) => [`${val}%`, 'Attendance']}
                 />
               </LineChart>
             </ResponsiveContainer>
           </div>
        </div>
      </div>

      <section style={{ marginTop: '48px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <Users size={20} color="var(--color-accent)" />
          Enrolled Students ({batch?.students?.length || 0})
        </h2>
        
        <div className="glass-card">
          {batch?.students?.length > 0 ? (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--color-border)' }}>
                    <th style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Student</th>
                    <th style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Since</th>
                    <th style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>Status</th>
                    <th style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.75rem', textTransform: 'uppercase', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {batch.students.map(student => (
                    <tr key={student.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <td style={{ padding: '16px 12px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={student.avatar_url || `https://i.pravatar.cc/150?u=${student.username}`} alt={student.username} style={{ width: '32px', height: '32px', borderRadius: '50%' }} />
                        <span style={{ fontWeight: 600 }}>{student.username}</span>
                      </td>
                      <td style={{ padding: '16px 12px', fontSize: '0.875rem' }}>{new Date(student.enrolled_at).toLocaleDateString()}</td>
                      <td style={{ padding: '16px 12px' }}>
                        <span style={{ background: 'var(--color-success)', color: 'var(--color-bg)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.625rem', fontWeight: 800 }}>ACTIVE</span>
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'right' }}>
                        <button 
                          className="btn btn--sm btn--ghost" 
                          style={{ color: 'var(--color-danger)', borderColor: 'transparent' }}
                          onClick={() => {
                            if(window.confirm(`Unenroll ${student.username}?`)) {
                              unenrollMutation.mutate({ batchId, studentId: student.id });
                            }
                          }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '40px', color: 'var(--color-text-muted)' }}>
              No students enrolled in this batch yet.
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default BatchDetailPage;
