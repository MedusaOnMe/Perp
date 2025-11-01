import dotenv from 'dotenv';
import axios, { AxiosInstance } from 'axios';
import { Tweet } from '../models/types';

// Load environment variables
dotenv.config();

export class TwitterService {
  private client: AxiosInstance;
  private botHandle: string;

  constructor() {
    const apiKey = process.env.RAPIDAPI_KEY;
    if (!apiKey) {
      throw new Error('RAPIDAPI_KEY environment variable not set');
    }

    this.botHandle = process.env.TWITTER_BOT_HANDLE || '';
    if (!this.botHandle) {
      throw new Error('TWITTER_BOT_HANDLE environment variable not set');
    }

    this.client = axios.create({
      baseURL: 'https://twitter154.p.rapidapi.com',
      headers: {
        'x-rapidapi-key': apiKey,
        'x-rapidapi-host': 'twitter154.p.rapidapi.com'
      },
      timeout: 10000
    });
  }

  /**
   * Get mentions of the bot account
   * @param limit - Maximum number of tweets to fetch
   * @returns Array of tweets mentioning the bot
   */
  async getMentions(limit = 50): Promise<Tweet[]> {
    try {
      // Use search endpoint to find mentions
      // Note: Exact endpoint may vary - adjust based on Twitter154 API docs
      const response = await this.client.get('/search/search', {
        params: {
          query: `@${this.botHandle}`,
          section: 'latest',
          limit
        }
      });

      // Parse response based on Twitter154 API structure
      // This may need adjustment based on actual API response format
      const tweets = this.parseTweetsFromResponse(response.data);

      return tweets;

    } catch (error) {
      console.error('Error fetching mentions:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Twitter API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Get user tweets by username
   * @param username - Twitter username (without @)
   * @param limit - Maximum number of tweets to fetch
   * @returns Array of tweets
   */
  async getUserTweets(username: string, limit = 20): Promise<Tweet[]> {
    try {
      const response = await this.client.get('/user/tweets', {
        params: {
          username: username.replace('@', ''),
          limit,
          include_replies: true
        }
      });

      return this.parseTweetsFromResponse(response.data);

    } catch (error) {
      console.error('Error fetching user tweets:', error);
      if (axios.isAxiosError(error)) {
        throw new Error(`Twitter API error: ${error.response?.data?.message || error.message}`);
      }
      throw error;
    }
  }

  /**
   * Reply to a tweet (requires Twitter API write access)
   * Note: Twitter154 may not support posting tweets - this is a placeholder
   * You may need to use official Twitter API v2 for posting
   */
  async reply(tweetId: string, message: string): Promise<void> {
    console.log(`[REPLY] Would reply to ${tweetId}: ${message}`);
    // TODO: Implement actual reply using Twitter API v2
    // For now, just log the reply
  }

  /**
   * Parse tweets from Twitter154 API response
   * Adjust this based on actual API response structure
   */
  private parseTweetsFromResponse(data: any): Tweet[] {
    try {
      // Twitter154 API response structure may vary
      // Adjust this based on actual response format
      const results = data.results || data.tweets || [];

      return results.map((item: any) => ({
        id: item.tweet_id || item.id_str || item.rest_id,
        text: item.text || item.full_text || '',
        author: {
          id: item.user?.id_str || item.user?.rest_id || '',
          username: item.user?.screen_name || item.user?.username || '',
          name: item.user?.name || ''
        },
        created_at: item.created_at || item.created || new Date().toISOString()
      }));

    } catch (error) {
      console.error('Error parsing tweets:', error);
      return [];
    }
  }

  /**
   * Filter tweets to get only new mentions (not seen before)
   * @param tweets - All tweets
   * @param lastSeenId - Last processed tweet ID
   * @returns New tweets only
   */
  filterNewTweets(tweets: Tweet[], lastSeenId?: string): Tweet[] {
    if (!lastSeenId) return tweets;

    const lastSeenIndex = tweets.findIndex(t => t.id === lastSeenId);
    if (lastSeenIndex === -1) return tweets;

    return tweets.slice(0, lastSeenIndex);
  }
}

// Singleton instance
export const twitterService = new TwitterService();
