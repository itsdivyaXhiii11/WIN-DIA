import { NextResponse } from 'next/server';
import { getAdminClient } from '@/src/backend/config/supabase.config';
import { createErrorResponse } from '@/src/backend/types/api-response.types';

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { email } = body;

    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json(
        createErrorResponse('VALIDATION_ERROR', 'Email is required'),
        { status: 400 }
      );
    }

    // Normalize email: trim and lowercase
    const normalizedEmail = email.trim().toLowerCase();

    // Check if any order exists with confirmed successful payment
    // Only consider returning customers if they have payment_status = 'paid'
    const client = getAdminClient();
    const { data, error } = await client
      .from('orders')
      .select('id')
      .eq('customer_email', normalizedEmail)
      .eq('payment_status', 'paid')
      .limit(1);

    if (error) {
      console.error('Email check failed:', error);
      return NextResponse.json(
        createErrorResponse('INTERNAL_SERVER_ERROR', 'Could not check email'),
        { status: 500 }
      );
    }

    const hasOrders = data && data.length > 0;

    return NextResponse.json({
      success: true,
      hasOrders,
      requiresLogin: hasOrders,
    });
  } catch (err: any) {
    console.error('Email check error:', err);
    return NextResponse.json(
      createErrorResponse('INTERNAL_SERVER_ERROR', 'An unexpected error occurred'),
      { status: 500 }
    );
  }
}
