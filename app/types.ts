export interface UserReview {
  review: string;
  movieID: string;
  timestamp?: string;
  rating?: number;
}

export interface UserFavourite {
  movieID: string;
}

export interface UserWatched {
  movieID: string;
}

export interface User {
  uid: string;
  name: string;
  bio: string;
  photoUrl: string;
  favourites: UserFavourite[];
  watched: UserWatched[];
  reviews: UserReview[];
}

export interface Review {
  movieID: number;
  userName: string;
  uid: string;
  userURL: string;
  review: string;
  timestamp?: string;
  rating?: number;
}

export interface Movie {
  id: string;
  title: string;
  backdrop_path: string;
  poster_path: string;
}

export interface UserBook {
  bookKey: string;       // Open Library key e.g. "/works/OL45804W"
  title: string;
  author: string;
  cover_id?: number;
  rating?: number;       // 1-5
  review?: string;
  timestamp?: string;
}

export interface UserAlbum {
  mbid: string;          // MusicBrainz ID
  title: string;
  artist: string;
  cover_url?: string;
  rating?: number;       // 1-5
  review?: string;
  timestamp?: string;
}
