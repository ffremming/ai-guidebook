'use client';

import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

export type PolicyChangeNotification = {
  id: string;
  userId: string;
  assignmentId: string;
  oldPolicyVersionId: string;
  newPolicyVersionId: string;
  changeSummary: string;
  isRead: boolean;
  createdAt: string;
};

type NotificationsResponse = {
  notifications: PolicyChangeNotification[];
  unreadCount: number;
};

const notificationsQueryKey = ['notifications'] as const;

async function fetchNotifications(): Promise<NotificationsResponse> {
  const response = await fetch('/api/notifications', {
    method: 'GET',
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Failed to fetch notifications');
  }

  return (await response.json()) as NotificationsResponse;
}

async function markNotificationRead(id: string): Promise<PolicyChangeNotification> {
  const response = await fetch(`/api/notifications/${id}`, {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({ isRead: true }),
  });

  if (!response.ok) {
    throw new Error('Failed to mark notification as read');
  }

  return (await response.json()) as PolicyChangeNotification;
}

export function useNotifications() {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: fetchNotifications,
    refetchInterval: 60_000,
  });

  const mutation = useMutation({
    mutationFn: (id: string) => markNotificationRead(id),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: notificationsQueryKey });

      const previous = queryClient.getQueryData<NotificationsResponse>(notificationsQueryKey);
      if (!previous) {
        return { previous };
      }

      const wasUnread = previous.notifications.some((item) => item.id === id && !item.isRead);
      const next: NotificationsResponse = {
        notifications: previous.notifications.map((item) =>
          item.id === id ? { ...item, isRead: true } : item,
        ),
        unreadCount: wasUnread ? Math.max(0, previous.unreadCount - 1) : previous.unreadCount,
      };

      queryClient.setQueryData(notificationsQueryKey, next);
      return { previous };
    },
    onError: (_error, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(notificationsQueryKey, context.previous);
      }
    },
    onSuccess: (updatedNotification) => {
      queryClient.setQueryData<NotificationsResponse>(notificationsQueryKey, (previous) => {
        if (!previous) {
          return previous;
        }

        return {
          ...previous,
          notifications: previous.notifications.map((item) =>
            item.id === updatedNotification.id ? updatedNotification : item,
          ),
        };
      });
    },
  });

  const unreadNotifications = useMemo(
    () => (query.data?.notifications ?? []).filter((item) => !item.isRead),
    [query.data],
  );

  return {
    notifications: query.data?.notifications ?? [],
    unreadNotifications,
    unreadCount: query.data?.unreadCount ?? 0,
    isLoading: query.isLoading,
    isError: query.isError,
    markRead: mutation.mutateAsync,
  };
}
