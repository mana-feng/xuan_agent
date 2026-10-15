export type AnnouncementMeta = { id: number; updatedAt?: string };
export type Announcement = AnnouncementMeta & { title: string; content: string; createdAt?: string; expiresAt?: string };

// The standalone site has no announcement server.
export async function fetchAnnouncementMeta() { return { data: { meta: [] as AnnouncementMeta[] } }; }
export async function fetchAnnouncements() { return { data: { list: [] as Announcement[] } }; }
