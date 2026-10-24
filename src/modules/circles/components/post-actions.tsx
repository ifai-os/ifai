'use client'

import { createContext, use, useCallback } from 'react'

import { toggleReaction, type PostView, type Reaction, type ReactionView } from '../rules'
import { json, request, useCirclesSession } from './circles-session'

/** What a post on screen can do, from the feed or the post's own page around it. */
export type PostActions = {
  /** When the posts were read, for「3 小时前」. */
  loadedAt: number
  /** Gives or takes back the reader's reaction; a visitor gets the sign-in dialog. */
  react: (post: PostView, reaction: Reaction, on: boolean) => void
  /** Deletes the reader's own post. */
  remove: (postId: number) => Promise<boolean>
}

export const PostActionsContext = createContext<PostActions | null>(null)

export function usePostActions(): PostActions {
  const value = use(PostActionsContext)
  if (!value) throw new Error('usePostActions needs a PostActionsContext around it')
  return value
}

/**
 * Reacting to a post: shown at once, put back if the server says no. `setReactions` puts a post's
 * reactions wherever the page keeps its posts.
 */
export function useReact(setReactions: (postId: number, reactions: ReactionView[]) => void): PostActions['react'] {
  const { signedIn, sessionPending, askToSignIn } = useCirclesSession()
  return useCallback(
    (post: PostView, reaction: Reaction, on: boolean) => {
      if (sessionPending) return
      if (!signedIn) {
        askToSignIn('react')
        return
      }
      const before = post.reactions
      setReactions(post.id, toggleReaction(before, reaction, on))
      void request<{ reactions: ReactionView[] }>('/api/circles/reactions', json({ post: post.id, reaction, on })).then(({ data, status }) => {
        if (data) setReactions(post.id, data.reactions)
        else {
          setReactions(post.id, before)
          if (status === 401) askToSignIn('react')
        }
      })
    },
    [sessionPending, signedIn, askToSignIn, setReactions],
  )
}
