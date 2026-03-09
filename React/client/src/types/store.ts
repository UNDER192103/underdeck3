

export interface StoreItem {
    id: string;
    type: 1 | 2 | 3;
    name: string;
    description: string;
    meta_data: {
        url?: string;
        type?: string;
        mediaType?: string;
        mimeType?: string;
    }
}

