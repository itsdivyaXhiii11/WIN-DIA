-- Link guest orders to user account after successful payment and authentication
-- Only links orders that:
-- 1. Have user_id = NULL (guest orders)
-- 2. Have customer_email matching the user's verified email
-- 3. Have payment_status = 'paid' (confirmed successful payment)

CREATE OR REPLACE FUNCTION public.link_guest_orders_to_account(
    p_user_id UUID,
    p_user_email TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_linked_count INTEGER := 0;
    v_addresses_saved INTEGER := 0;
    v_order RECORD;
    v_address_exists BOOLEAN;
    v_shipping_addr JSONB;
BEGIN
    -- Validate inputs
    IF p_user_id IS NULL OR p_user_email IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'user_id and user_email are required'
        );
    END IF;

    -- Link eligible guest orders to the user account
    -- Only link orders with confirmed successful payment (payment_status = 'paid')
    UPDATE public.orders
    SET user_id = p_user_id
    WHERE user_id IS NULL
      AND LOWER(TRIM(customer_email)) = LOWER(TRIM(p_user_email))
      AND payment_status = 'paid'
    RETURNING * INTO v_order;

    GET DIAGNOSTICS v_linked_count = ROW_COUNT;

    -- Save shipping addresses from linked orders to public.addresses
    -- Only if they don't already exist for this user
    FOR v_order IN 
        SELECT id, shipping_address 
        FROM public.orders 
        WHERE user_id = p_user_id 
          AND payment_status = 'paid'
          AND shipping_address IS NOT NULL
          AND shipping_address != '{}'::JSONB
    LOOP
        v_shipping_addr := v_order.shipping_address;
        
        -- Check if a similar address already exists
        -- Compare on phone and pincode to avoid exact duplicates
        SELECT EXISTS(
            SELECT 1 FROM public.addresses
            WHERE user_id = p_user_id
              AND phone = v_shipping_addr->>'phone'
              AND pincode = v_shipping_addr->>'pincode'
        ) INTO v_address_exists;

        -- Insert address if it doesn't exist
        IF NOT v_address_exists AND v_shipping_addr->>'phone' IS NOT NULL THEN
            INSERT INTO public.addresses (
                user_id,
                full_name,
                phone,
                address_line1,
                address_line2,
                city,
                state,
                pincode,
                is_default
            ) VALUES (
                p_user_id,
                COALESCE(v_shipping_addr->>'full_name', v_shipping_addr->>'name', ''),
                v_shipping_addr->>'phone',
                COALESCE(v_shipping_addr->>'address_line1', v_shipping_addr->>'street_address', ''),
                v_shipping_addr->>'address_line2',
                COALESCE(v_shipping_addr->>'city', ''),
                COALESCE(v_shipping_addr->>'state', ''),
                COALESCE(v_shipping_addr->>'pincode', v_shipping_addr->>'postal_code', ''),
                false  -- Never set as default automatically
            )
            ON CONFLICT DO NOTHING;  -- Safety: ignore if somehow inserted concurrently
            
            v_addresses_saved := v_addresses_saved + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object(
        'success', true,
        'linked_orders', v_linked_count,
        'addresses_saved', v_addresses_saved
    );
EXCEPTION
    WHEN OTHERS THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', SQLERRM
        );
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.link_guest_orders_to_account(UUID, TEXT) TO authenticated;
