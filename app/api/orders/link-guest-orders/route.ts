import { NextResponse } from 'next/server';
import { getAuthUserContext } from '@/src/backend/utils/route-helper.util';
import { createErrorResponse } from '@/src/backend/types/api-response.types';
import { getAdminClient } from '@/src/backend/config/supabase.config';
import { logger } from '@/src/backend/utils/logger.util';

/**
 * POST /api/orders/link-guest-orders
 * 
 * Links guest orders to the authenticated user's account after successful payment.
 * Only links orders where:
 * - user_id IS NULL (guest orders)
 * - customer_email matches the authenticated user's email
 * - payment_status = 'paid' (confirmed successful payment)
 * 
 * Also saves shipping addresses from linked orders to public.addresses table
 * if they don't already exist.
 * 
 * This endpoint is idempotent - safe to call multiple times.
 */
export async function POST(request: Request) {
  try {
    // Require authentication
    const authRes = await getAuthUserContext(request);
    if (!authRes.success) {
      return NextResponse.json(
        createErrorResponse('UNAUTHORIZED', 'Authentication required'),
        { status: 401 }
      );
    }

    const userId = authRes.value.id;
    const userEmail = authRes.value.email;

    if (!userEmail) {
      return NextResponse.json(
        createErrorResponse('VALIDATION_ERROR', 'User email not found'),
        { status: 400 }
      );
    }

    // Call the RPC function to link guest orders
    const client = getAdminClient();
    const { data, error } = await client.rpc('link_guest_orders_to_account', {
      p_user_id: userId,
      p_user_email: userEmail,
    });

    if (error) {
      logger.error(`[link-guest-orders] RPC error for user ${userId}:`, error);
      return NextResponse.json(
        createErrorResponse('INTERNAL_SERVER_ERROR', 'Failed to link guest orders'),
        { status: 500 }
      );
    }

    // RPC returns JSONB with success, linked_orders, addresses_saved, or error
    const result = data as { success: boolean; linked_orders?: number; addresses_saved?: number; error?: string };

    if (!result.success) {
      logger.error(`[link-guest-orders] RPC returned error for user ${userId}:`, result.error);
      return NextResponse.json(
        createErrorResponse('INTERNAL_SERVER_ERROR', result.error || 'Failed to link guest orders'),
        { status: 500 }
      );
    }

    logger.info(
      `[link-guest-orders] User ${userId} linked ${result.linked_orders || 0} orders, ` +
      `saved ${result.addresses_saved || 0} addresses`
    );

    return NextResponse.json({
      success: true,
      linked_orders: result.linked_orders || 0,
      addresses_saved: result.addresses_saved || 0,
    });
  } catch (err: any) {
    logger.error('[link-guest-orders] Unexpected error:', err);
    return NextResponse.json(
      createErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred'),
      { status: 500 }
    );
  }
}
