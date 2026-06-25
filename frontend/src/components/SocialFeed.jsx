import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Heart, MessageCircle, Share2, MoreHorizontal,
  X, Plus, Image, Video, Send, Trash2,
} from 'lucide-react';
import api from '../services/api';
import { toast } from 'react-hot-toast';
import useAuthStore from '../hooks/useAuthStore';

// ============================================
// API Functions
// ============================================
const fetchFeed = async () => {
  const { data } = await api.get('/feed');
  return data.data;
};

const createPost = async (payload) => {
  if (payload.mediaFile) {
    const formData = new FormData();
    formData.append('mediaFile', payload.mediaFile);
    if (payload.caption) formData.append('caption', payload.caption);
    if (payload.relatedTrick) formData.append('relatedTrick', payload.relatedTrick);
    const { data } = await api.post('/feed', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
    return data.data;
  } else {
    const { data } = await api.post('/feed', payload);
    return data.data;
  }
};

const deletePost = async (postId) => {
  await api.delete(`/feed/${postId}`);
};

const toggleLike = async (postId) => {
  const { data } = await api.post(`/feed/${postId}/like`);
  return data;
};

const fetchComments = async (postId) => {
  const { data } = await api.get(`/feed/${postId}/comments`);
  return data.data;
};

const addComment = async ({ postId, content }) => {
  const { data } = await api.post(`/feed/${postId}/comments`, { content });
  return data.data;
};

// ============================================
// CreatePostModal
// ============================================
const CreatePostModal = ({ onClose }) => {
  const [mediaFile, setMediaFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState('');
  const [caption, setCaption] = useState('');
  const [relatedTrick, setRelatedTrick] = useState('');
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: createPost,
    onSuccess: () => {
      toast.success('Post shared!');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
      onClose();
    },
    onError: (err) => {
      toast.error(err.response?.data?.message || 'Failed to create post');
    },
  });

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (file.size > 15 * 1024 * 1024) {
         return toast.error('File size must be less than 15MB');
      }
      setMediaFile(file);
      setPreviewUrl(URL.createObjectURL(file));
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!mediaFile) return toast.error('Please select a photo or video to upload.');
    mutation.mutate({ mediaFile, caption, relatedTrick });
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-header">
          <h2 className="modal-title">New Post</h2>
          <button className="modal-close" onClick={onClose}><X size={20} /></button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Upload Media</label>
            {!previewUrl ? (
              <div 
                style={{ 
                  border: '2px dashed var(--color-border)', 
                  padding: '40px 20px', 
                  textAlign: 'center', 
                  borderRadius: 'var(--radius-md)',
                  cursor: 'pointer',
                  position: 'relative'
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginBottom: '12px' }}>
                   <Image size={32} color="var(--color-text-muted)" />
                   <Video size={32} color="var(--color-text-muted)" />
                </div>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.875rem' }}>Click to select a photo or video</p>
                <input 
                  type="file" 
                  accept="image/*, video/*" 
                  onChange={handleFileChange}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer' }}
                />
              </div>
            ) : (
              <div style={{ position: 'relative', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: '#000' }}>
                 {mediaFile?.type.startsWith('video/') ? (
                    <video src={previewUrl} style={{ width: '100%', maxHeight: '300px', objectFit: 'contain' }} controls />
                 ) : (
                    <img src={previewUrl} style={{ width: '100%', maxHeight: '300px', objectFit: 'contain' }} alt="Preview" />
                 )}
                 <button 
                   type="button"
                   style={{ position: 'absolute', top: '8px', right: '8px', background: 'rgba(0,0,0,0.7)', border: 'none', color: '#fff', borderRadius: '50%', padding: '4px', cursor: 'pointer' }}
                   onClick={() => { setMediaFile(null); setPreviewUrl(''); }}
                 ><X size={16}/></button>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Caption</label>
            <textarea
              className="form-input"
              placeholder="What's the vibe?"
              value={caption}
              onChange={(e) => setCaption(e.target.value)}
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          <div className="form-group" style={{ marginBottom: 0 }}>
            <label>Linked Trick (optional)</label>
            <input
              className="form-input"
              type="text"
              placeholder="e.g. Kickflip, Heelflip"
              value={relatedTrick}
              onChange={(e) => setRelatedTrick(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '12px', marginTop: '24px' }}>
            <button type="submit" className="btn btn--primary" style={{ flex: 1, justifyContent: 'center' }} disabled={mutation.isPending}>
              {mutation.isPending ? 'Uploading...' : 'Share Post'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={onClose}>Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ============================================
// CommentsSection
// ============================================
const CommentsSection = ({ postId }) => {
  const [newComment, setNewComment] = useState('');
  const queryClient = useQueryClient();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['comments', postId],
    queryFn: () => fetchComments(postId),
  });

  const mutation = useMutation({
    mutationFn: addComment,
    onSuccess: () => {
      setNewComment('');
      queryClient.invalidateQueries({ queryKey: ['comments', postId] });
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to add comment'),
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!newComment.trim()) return;
    mutation.mutate({ postId, content: newComment.trim() });
  };

  return (
    <div className="comments-section">
      {isLoading ? (
        <p className="comments-loading">Loading comments...</p>
      ) : (
        <div className="comments-list">
          {comments.length === 0 && (
            <p className="comments-empty">No comments yet. Be the first!</p>
          )}
          {comments.map(c => (
            <div key={c.id} className="comment-item">
              <img
                src={c.user?.avatar || `https://i.pravatar.cc/150?u=${c.user?.username}`}
                alt={c.user?.username}
                className="comment-avatar"
              />
              <div className="comment-body">
                <strong className="comment-username">{c.user?.username}</strong>
                <span className="comment-content"> {c.content}</span>
              </div>
            </div>
          ))}
        </div>
      )}
      <form className="comment-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          className="comment-input"
        />
        <button type="submit" className="comment-submit" disabled={mutation.isPending || !newComment.trim()}>
          <Send size={16} />
        </button>
      </form>
    </div>
  );
};

// ============================================
// PostCard
// ============================================
const PostCard = ({ post }) => {
  const { user } = useAuthStore();
  const queryClient = useQueryClient();
  const [showComments, setShowComments] = useState(false);
  const [liked, setLiked] = useState(false);

  const likeMutation = useMutation({
    mutationFn: () => toggleLike(post.id),
    onSuccess: (data) => {
      setLiked(data.liked);
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Failed to update like'),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deletePost(post.id),
    onSuccess: () => {
      toast.success('Post deleted.');
      queryClient.invalidateQueries({ queryKey: ['feed'] });
    },
    onError: (err) => toast.error(err.response?.data?.message || 'Could not delete'),
  });

  const canDelete = post.userId === user?.id || user?.role === 'admin';

  return (
    <article className="post-card">
      {/* Header */}
      <div className="post-header">
        <div className="post-user-info">
          <img
            src={post.user?.avatar || `https://i.pravatar.cc/150?u=${post.user?.username}`}
            alt={post.user?.username}
            className="post-avatar"
          />
          <span className="post-username">{post.user?.username}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {canDelete && (
            <button
              className="post-action-btn"
              onClick={() => {
                if (window.confirm('Delete this post?')) deleteMutation.mutate();
              }}
              title="Delete post"
              style={user?.role === 'admin' && post.userId !== user?.id ? { color: 'var(--color-danger)' } : {}}
            >
              <Trash2 size={16} />
              {user?.role === 'admin' && post.userId !== user?.id && (
                 <span style={{ fontSize: '0.65rem', fontWeight: 'bold', marginLeft: '4px', border: '1px solid currentColor', padding: '1px 4px', borderRadius: '4px' }}>MOD</span>
              )}
            </button>
          )}
          <MoreHorizontal size={20} className="post-action-btn" />
        </div>
      </div>

      {/* Media */}
      <div className="post-media">
        {post.mediaType === 'video' ? (
          <video src={post.mediaUrl} controls muted loop className="post-media-item" />
        ) : (
          <img src={post.mediaUrl} alt="Post content" className="post-media-item"
            onError={(e) => { e.target.src = 'https://images.unsplash.com/photo-1547447134-cd3f5c716030?w=600'; }}
          />
        )}
        {post.relatedTrick && (
          <div className="trick-badge">
            🏆 Verified Trick: {post.relatedTrick}
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="post-actions">
        <div className="post-action-buttons">
          <button
            className={`post-action-btn ${liked ? 'liked' : ''}`}
            onClick={() => likeMutation.mutate()}
            disabled={likeMutation.isPending}
          >
            <Heart size={24} fill={liked ? 'var(--color-danger)' : 'none'} color={liked ? 'var(--color-danger)' : 'currentColor'} />
          </button>
          <button className="post-action-btn" onClick={() => setShowComments(v => !v)}>
            <MessageCircle size={24} />
          </button>
          <button className="post-action-btn" onClick={() => {
            navigator.share?.({ text: post.caption, url: window.location.href })
              .catch(() => {});
          }}>
            <Share2 size={24} />
          </button>
        </div>
        <div className="post-likes">{post.likes} likes</div>
      </div>

      {/* Caption */}
      <div className="post-caption">
        <strong>{post.user?.username}</strong> {post.caption}
      </div>

      {/* Comments toggle */}
      <button className="post-comments-meta" onClick={() => setShowComments(v => !v)}>
        {showComments ? 'Hide' : `View all ${post.comments || 0} comments`}
      </button>

      {/* Comments section */}
      {showComments && <CommentsSection postId={post.id} />}
    </article>
  );
};

// ============================================
// Main SocialFeed
// ============================================
export default function SocialFeed() {
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: posts = [], isLoading, isError, error } = useQuery({
    queryKey: ['feed'],
    queryFn: fetchFeed,
  });

  return (
    <div className="feed-wrap">
      {showCreateModal && <CreatePostModal onClose={() => setShowCreateModal(false)} />}

      <div className="feed-header">
        <h1 className="feed-title">Skate Feed</h1>
        <button className="btn btn--primary btn--sm" onClick={() => setShowCreateModal(true)}>
          <Plus size={18} /> New Post
        </button>
      </div>

      {isLoading && (
        <div className="feed-status">Loading skate vibes...</div>
      )}

      {isError && (
        <div className="feed-status error">Error: {error?.message}</div>
      )}

      {!isLoading && !isError && posts.length === 0 && (
        <div className="feed-empty">
          <p>No posts yet.</p>
          <button className="btn btn--primary" style={{ marginTop: '16px' }} onClick={() => setShowCreateModal(true)}>
            <Plus size={18} /> Be the first to post
          </button>
        </div>
      )}

      <div className="posts-list">
        {posts.map((post, i) => (
          <div
            key={post.id}
            className="animate-fade-in"
            style={{ animationDelay: `${i * 0.06}s` }}
          >
            <PostCard post={post} />
          </div>
        ))}
      </div>

      <style>{`
        .feed-wrap {
          max-width: 520px;
          margin: 0 auto;
        }

        .feed-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 24px;
        }

        .feed-title {
          font-size: 1.75rem;
          font-weight: 900;
        }

        .feed-status {
          display: flex;
          align-items: center;
          justify-content: center;
          height: 160px;
          color: var(--color-text-muted);
        }

        .feed-status.error { color: var(--color-danger); }

        .feed-empty {
          text-align: center;
          padding: 60px 24px;
          color: var(--color-text-muted);
        }

        .posts-list {
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        /* Post Card */
        .post-card {
          background: var(--color-surface);
          border: 1px solid var(--color-border);
          border-radius: var(--radius-lg);
          margin-bottom: 16px;
          overflow: hidden;
        }

        .post-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 14px 16px;
        }

        .post-user-info {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .post-avatar {
          width: 36px;
          height: 36px;
          border-radius: 50%;
          object-fit: cover;
          border: 2px solid var(--color-accent);
        }

        .post-username {
          font-weight: 700;
          font-size: 0.9rem;
        }

        .post-action-btn {
          background: transparent;
          border: none;
          color: var(--color-text-muted);
          cursor: pointer;
          padding: 4px;
          border-radius: var(--radius-sm);
          transition: color 0.2s, transform 0.2s;
          display: flex;
          align-items: center;
        }

        .post-action-btn:hover { color: var(--color-text-primary); }
        .post-action-btn.liked { color: var(--color-danger); }

        .post-media {
          position: relative;
          width: 100%;
          background: #111;
          display: flex;
          justify-content: center;
          align-items: center;
        }

        .post-media-item {
          width: 100%;
          max-height: 560px;
          object-fit: cover;
          display: block;
        }

        .trick-badge {
          position: absolute;
          bottom: 0;
          left: 0;
          width: 100%;
          background: rgba(0,0,0,0.75);
          color: var(--color-accent);
          padding: 8px 16px;
          font-size: 0.8rem;
          font-weight: 700;
          backdrop-filter: blur(4px);
        }

        .post-actions {
          padding: 12px 16px 6px;
        }

        .post-action-buttons {
          display: flex;
          gap: 12px;
          margin-bottom: 8px;
        }

        .post-likes {
          font-weight: 700;
          font-size: 0.875rem;
        }

        .post-caption {
          padding: 2px 16px 10px;
          font-size: 0.875rem;
          line-height: 1.5;
        }

        .post-comments-meta {
          padding: 0 16px 12px;
          color: var(--color-text-muted);
          font-size: 0.8rem;
          background: transparent;
          border: none;
          cursor: pointer;
          font-family: var(--font-body);
          text-align: left;
          text-decoration: underline;
          text-underline-offset: 2px;
        }

        /* Comments */
        .comments-section {
          border-top: 1px solid var(--color-border);
          padding: 12px 16px;
        }

        .comments-loading, .comments-empty {
          font-size: 0.8rem;
          color: var(--color-text-muted);
          padding: 4px 0;
        }

        .comments-list {
          display: flex;
          flex-direction: column;
          gap: 10px;
          margin-bottom: 12px;
          max-height: 200px;
          overflow-y: auto;
        }

        .comment-item {
          display: flex;
          gap: 10px;
          align-items: flex-start;
        }

        .comment-avatar {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          object-fit: cover;
          flex-shrink: 0;
        }

        .comment-body {
          font-size: 0.85rem;
          line-height: 1.4;
        }

        .comment-username {
          font-weight: 700;
        }

        .comment-content {
          color: var(--color-text-primary);
        }

        .comment-form {
          display: flex;
          gap: 8px;
          align-items: center;
          border-top: 1px solid var(--color-border);
          padding-top: 12px;
        }

        .comment-input {
          flex: 1;
          background: transparent;
          border: none;
          outline: none;
          color: var(--color-text-primary);
          font-family: var(--font-body);
          font-size: 0.875rem;
        }

        .comment-input::placeholder { color: var(--color-text-muted); }

        .comment-submit {
          background: transparent;
          border: none;
          color: var(--color-accent);
          cursor: pointer;
          padding: 4px;
          display: flex;
          align-items: center;
          opacity: 0.7;
          transition: opacity 0.2s;
        }

        .comment-submit:hover:not(:disabled) { opacity: 1; }
        .comment-submit:disabled { opacity: 0.3; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
