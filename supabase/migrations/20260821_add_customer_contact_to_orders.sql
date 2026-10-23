-- Add customer_email and customer_phone columns to orders table for guest checkout support
-- These columns store contact information for guest orders (where user_id IS NULL)
-- and are used to identify returning customers and link orders after authentication
-- Safe to run multiple times - all operations use IF NOT EXISTS

-- Add customer_email column (nullable for backward compatibility with existing orders)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_email TEXT;

-- Add customer_phone column (nullable for backward compatibility)
ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS customer_phone TEXT;

-- Create index on customer_email for efficient returning customer lookups
CREATE INDEX IF NOT EXISTS idx_orders_customer_email 
ON public.orders (customer_email) 
WHERE customer_email IS NOT NULL;

-- Create composite index for guest order queries (email + payment status)
CREATE INDEX IF NOT EXISTS idx_orders_guest_paid 
ON public.orders (customer_email, payment_status) 
WHERE user_id IS NULL;

-- Add check constraint to ensure guest orders have customer email
-- Only enforce for new orders (payment_status = 'pending' or 'paid')
-- Use DO block to check if constraint exists before adding
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'chk_guest_orders_have_contact'
    ) THEN
        ALTER TABLE public.orders 
        ADD CONSTRAINT chk_guest_orders_have_contact 
        CHECK (
            user_id IS NOT NULL 
            OR customer_email IS NOT NULL
        );
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN public.orders.customer_email IS 'Email for guest orders (user_id IS NULL). Used to identify returning customers and link orders after authentication.';
COMMENT ON COLUMN public.orders.customer_phone IS 'Phone number for guest orders. Extracted from shipping address for contact purposes.';
