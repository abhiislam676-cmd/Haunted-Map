export type LocationStatus = 'pending' | 'approved' | 'rejected' | 'needs_revision';
export type VerificationStatus = 'verified_history' | 'folklore_legend' | 'unverified_claim';

export interface HauntedLocation {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  category: string;
  historicalPeriod: string;
  activityTypes: string[];
  description: string;
  history: string;
  paranormalReports: string;
  localLegends: string;
  images: string[];
  videos: string[];
  sourceUrls: string[];
  status: LocationStatus;
  verificationStatus: VerificationStatus;
  featured: boolean;
  isAiDiscovered: boolean;
  researchDate: string;
  submittedBy: string;
  submittedByName: string;
  viewsCount: number;
  reviewsCount: number;
  ratingAvg: number;
  createdAt: string | number;
  updatedAt: string | number;
  isSeed?: boolean;
}

export interface LocationReview {
  id: string;
  locationId: string;
  userId: string;
  userName: string;
  userPhoto?: string;
  rating: number;
  comment: string;
  visitedDate?: string;
  status: 'published' | 'hidden';
  createdAt: string | number;
  updatedAt: string | number;
}

export interface UserProfile {
  uid: string;
  displayName: string;
  username?: string;
  photoURL?: string;
  coverURL?: string;
  bio?: string;
  role: 'member' | 'admin';
  suspended: boolean;
  isOnline?: boolean;
  lastSeenAt?: string | number;
  createdAt: string | number;
  updatedAt: string | number;
}

export interface LocationReport {
  id: string;
  locationId: string;
  locationName: string;
  reportedBy: string;
  reason: string;
  details: string;
  targetType?: 'location' | 'post' | 'comment';
  targetId?: string;
  status: 'open' | 'resolved' | 'dismissed';
  createdAt: string | number;
  updatedAt: string | number;
}

export interface CategoryItem {
  id: string;
  name: string;
  description?: string;
}

export interface AiDiscoveryDraft {
  id: string;
  name: string;
  country: string;
  city: string;
  address: string;
  lat: number | null;
  lng: number | null;
  category: string;
  historicalPeriod: string;
  activityTypes: string[];
  description: string;
  history: string;
  paranormalReports: string;
  localLegends: string;
  sourceUrls: string[];
  researchDate: string;
  verificationStatus: VerificationStatus;
  geocodeSource: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface AiDiscoveryStats {
  totalDiscovered: number;
  countriesResearched: string[];
  pendingCount: number;
  duplicatesRejected: number;
  lastResearchDate: string | null;
  autoEnabled: boolean;
  intervalHours: number;
  recentSourceLinks: { title: string; uri: string; country: string; date: string }[];
  logs: { timestamp: string; message: string; country?: string }[];
}

export interface CommunityPost {
  id: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  title?: string;
  content: string;
  images: string[];
  videos: string[];
  locationId?: string;
  locationName?: string;
  locationCountry?: string;
  mentions: string[];
  likesCount: number;
  commentsCount: number;
  sharesCount: number;
  status: 'published' | 'hidden';
  createdAt: string | number;
  updatedAt: string | number;
}

export interface PostComment {
  id: string;
  postId: string;
  parentId: string;
  authorId: string;
  authorName: string;
  authorPhoto?: string;
  content: string;
  mentions: string[];
  status: 'published' | 'hidden';
  createdAt: string | number;
  updatedAt: string | number;
}

export interface FollowRelation {
  id: string;
  followerId: string;
  followingId: string;
  createdAt: string | number;
}

export interface Conversation {
  id: string;
  participantIds: string[];
  lastMessageText: string;
  lastMessageSenderId: string;
  lastMessageAt: string | number;
  unreadBy: string[];
  typingUids: string[];
  createdAt: string | number;
  updatedAt: string | number;
}

export interface DirectMessage {
  id: string;
  conversationId: string;
  participantIds: string[];
  senderId: string;
  text: string;
  imageUrl?: string;
  readBy: string[];
  deleted: boolean;
  createdAt: string | number;
  updatedAt: string | number;
}

export type NotificationType =
  | 'like'
  | 'comment'
  | 'reply'
  | 'follow'
  | 'mention'
  | 'message'
  | 'location_status';

export interface AppNotification {
  id: string;
  recipientId: string;
  actorId: string;
  actorName: string;
  actorPhoto?: string;
  type: NotificationType;
  title: string;
  body: string;
  link: string;
  read: boolean;
  createdAt: string | number;
}
