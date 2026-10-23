import { NextResponse } from 'next/server';
import { container, ServiceTokens } from '@/src/backend/providers/container.provider';
import { CheckoutService } from '@/src/backend/services/checkout.service';
import { OrderService } from '@/src/backend/services/order.service';
import { getAuthUserContext, handleServiceResult } from '@/src/backend/utils/route-helper.util';
import { createErrorResponse } from '@/src/backend/types/api-response.types';
import { formatGlobalError } from '@/src/backend/middleware/error-handler.middleware';
import { getEnv } from '@/src/backend/config/env.config';

function handleGlobalError(err: any) {
  const formatted = formatGlobalError(err);
  return NextResponse.json(
    createErrorResponse(formatted.errorCode, formatted.message, formatted.details),
    { status: formatted.statusCode }
  );
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const isCod = body.paymentMethod === 'cod' || body.payment_method === 'cod';
    
    // Try to authenticate, but allow guest checkout
    const authRes = await getAuthUserContext(request);
    const isGuest = !authRes.success;
    const userId = isGuest ? null : authRes.value.id;
    
    // For guest checkout, require and validate customer_email
    if (isGuest) {
      const email = body.customer_email || body.email;
      if (!email || typeof email !== 'string' || !email.trim()) {
        return NextResponse.json(
          createErrorResponse('VALIDATION_ERROR', 'Email is required for guest checkout'),
          { status: 400 }
        );
      }
      
      // Validate email format
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
        return NextResponse.json(
          createErrorResponse('VALIDATION_ERROR', 'Valid email address is required'),
          { status: 400 }
        );
      }
    }

    // Fail early (before an order is created) if Razorpay isn't configured.
    const env = getEnv();
    const razorpayKeyId = env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '';
    if (!isCod && !razorpayKeyId) {
      return NextResponse.json(
        createErrorResponse('INTERNAL_SERVER_ERROR', 'Payment is not configured'),
        { status: 500 }
      );
    }

    // For authenticated users, use request-scoped DI; for guests, use global container
    const checkoutService = isGuest 
      ? container.resolve<CheckoutService>(ServiceTokens.CheckoutService)
      : authRes.value.scope.resolve<CheckoutService>(ServiceTokens.CheckoutService);

    const result = await checkoutService.processCheckout(userId, body);
    if (!result.success) {
      return handleServiceResult(result);
    }

    const { order, items, razorpayOrderId, pricing } = result.value;

    const legacyPayload = {
      success: true,
      order: {
        ...order,
        order_items: items,
        total_price: pricing.total,
        order_status: order.order_status || 'placed',
      },
      requiresPayment: !isCod,
      razorpay: !isCod
        ? {
            orderId: razorpayOrderId,
            amount: Math.round(pricing.total * 100),
            currency: 'INR',
            keyId: razorpayKeyId,
          }
        : null,
      data: result.value,
    };

    return NextResponse.json(legacyPayload, { status: 201 });
  } catch (err: any) {
    return handleGlobalError(err);
  }
}

export async function GET(request: Request) {
  try {
    const authRes = await getAuthUserContext(request);
    if (!authRes.success) {
      return handleServiceResult(authRes);
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1', 10);
    const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);

    const orderService = authRes.value.scope.resolve<OrderService>(ServiceTokens.OrderService);
    const result = await orderService.getUserOrders(authRes.value.id, { page, pageSize });

    if (!result.success) {
      return handleServiceResult(result);
    }

    return NextResponse.json({
      success: true,
      orders: result.value.items || [],
      total: result.value.total || 0,
      data: result.value,
    });
  } catch (err: any) {
    return handleGlobalError(err);
  }
}