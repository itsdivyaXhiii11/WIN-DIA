"use client";
import { useEffect, useRef } from "react";
import { Provider, useDispatch, useSelector } from "react-redux";
import store from "@/src/frontend/redux/store";
import { setCart } from "@/src/frontend/redux/slices/cartSlice";
import { setWishlist } from "@/src/frontend/redux/slices/wishlistSlice";
import { AuthProvider, useAuth } from "@/src/frontend/hooks/useAuth";
import { useCartSync } from "@/src/frontend/hooks/useCartSync";
import { useWishlistSync } from "@/src/frontend/hooks/useWishlistSync";
import { Toaster } from "react-hot-toast";

// Helper: Generate unique key for cart item matching (product + variant + size)
function getItemMatchId(item) {
  return `${item.product_id}_${item.variant_id || "null"}_${item.size || "null"}`;
}

// Helper: Merge guest cart into user cart (combine quantities for matching items)
function mergeCarts(guestCart, userCart) {
  const merged = [...userCart];
  const userItemsMap = new Map(merged.map((item) => [getItemMatchId(item), item]));

  guestCart.forEach((guestItem) => {
    const matchId = getItemMatchId(guestItem);
    const existingItem = userItemsMap.get(matchId);

    if (existingItem) {
      // Same product+variant+size exists - combine quantities
      existingItem.quantity = (existingItem.quantity || 1) + (guestItem.quantity || 1);
    } else {
      // New item - add to merged cart
      merged.push(guestItem);
    }
  });

  return merged;
}

function Persistence() {
  const dispatch = useDispatch();
  const { user, loading } = useAuth();
  const hydrated = useRef(false);
  const cartItems = useSelector((s) => s.cart.cartItems);
  const wishlistItems = useSelector((s) => s.wishlist.wishlistItems);
  const prevUserId = useRef(null);
  const migrationCompleted = useRef(false);

  // Sync cart and wishlist with backend Supabase when logged in
  useCartSync();
  useWishlistSync();

  // Hydrate from localStorage when auth resolves
  useEffect(() => {
    if (loading) return; // Wait for auth to resolve

    if (user) {
      // User is logged in — load their data from localStorage (keyed by user ID)
      try {
        const cartKey = `cartItems_${user.id}`;
        const wishKey = `wishlistItems_${user.id}`;
        const userCart = JSON.parse(localStorage.getItem(cartKey) || "[]");
        const userWishlist = JSON.parse(localStorage.getItem(wishKey) || "[]");

        // Migrate guest cart on first login (prevUserId.current === null means just logged in)
        if (prevUserId.current === null && !migrationCompleted.current) {
          try {
            const guestCart = JSON.parse(localStorage.getItem("cartItems_guest") || "[]");
            if (guestCart.length > 0) {
              const mergedCart = mergeCarts(guestCart, userCart);
              dispatch(setCart(mergedCart));
              localStorage.setItem(cartKey, JSON.stringify(mergedCart));
              // Clear guest cart after successful migration
              localStorage.removeItem("cartItems_guest");
              migrationCompleted.current = true;
            } else {
              dispatch(setCart(userCart));
            }
          } catch (err) {
            console.error("Guest cart migration failed:", err);
            dispatch(setCart(userCart)); // Fall back to user cart only
            migrationCompleted.current = true; // Don't retry
          }
        } else {
          dispatch(setCart(userCart));
        }

        dispatch(setWishlist(userWishlist));
      } catch {
        dispatch(setCart([]));
        dispatch(setWishlist([]));
      }
      prevUserId.current = user.id;
    } else {
      // Not logged in — load guest cart only (no wishlist for guests)
      try {
        const guestCart = JSON.parse(localStorage.getItem("cartItems_guest") || "[]");
        dispatch(setCart(guestCart));
      } catch {
        dispatch(setCart([]));
      }
      dispatch(setWishlist([])); // Wishlist requires auth
      prevUserId.current = null;
      migrationCompleted.current = false; // Reset for next login
    }
    hydrated.current = true;
  }, [user, loading, dispatch]);

  // Persist cart to localStorage
  useEffect(() => {
    if (hydrated.current) {
      if (prevUserId.current) {
        // Logged in - save to user-specific key
        localStorage.setItem(`cartItems_${prevUserId.current}`, JSON.stringify(cartItems));
      } else {
        // Guest - save to guest key
        localStorage.setItem("cartItems_guest", JSON.stringify(cartItems));
      }
    }
  }, [cartItems]);

  // Persist wishlist to localStorage (only for logged-in users)
  useEffect(() => {
    if (hydrated.current && prevUserId.current) {
      localStorage.setItem(`wishlistItems_${prevUserId.current}`, JSON.stringify(wishlistItems));
    }
  }, [wishlistItems]);

  return null;
}

export default function Providers({ children }) {
  return (
    <Provider store={store}>
      <AuthProvider>
        <Persistence />
        <Toaster position="top-center" toastOptions={{ duration: 2600 }} />
        {children}
      </AuthProvider>
    </Provider>
  );
}
