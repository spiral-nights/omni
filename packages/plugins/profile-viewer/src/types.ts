export interface NoteInteractionStats {
  likes: number;
  replies: number;
  reposts: number;
  zaps: number;
  liked?: boolean;
  reposted?: boolean;
}

export interface ProfileMetadata {
  name?: string;
  displayName?: string;
  display_name?: string;
  about?: string;
  picture?: string;
  avatar?: string;
  banner?: string;
  nip05?: string;
  lud16?: string;
  website?: string;
  pubkey?: string;
  npub?: string;
}

export interface TargetUserProfile extends ProfileMetadata {
  isFollowing?: boolean;
}
