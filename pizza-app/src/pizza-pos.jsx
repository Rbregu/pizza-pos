import { useState, useEffect, useRef, useCallback } from "react";
import { supabase } from "./lib/supabase";
import { getProducts, addProduct, deleteProduct, subscribeToProducts } from "./services/productService";
import { getOrders, placeOrder, updateOrderItems, updateOrderStatus, dismissOrder, subscribeToOrders } from "./services/orderService";
import { lookupCustomer, upsertCustomer, formatPhone } from "./services/customerService";
import { getCategories, addCategory, deleteCategory } from "./services/categoryService";
import { loadPricing, savePricing, savePricingBatch, getPizzaExtraPrice } from "./services/pricingService";

// ─────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────
const ALL_TOPPINGS = [
  { id:"marinara",      label:"Marinara Sauce" },
  { id:"white_sauce",   label:"White Sauce" },
  { id:"cheese",        label:"Mozzarella Cheese" },
  { id:"extra_cheese",  label:"Extra Cheese" },
  { id:"pepperoni",     label:"Pepperoni" },
  { id:"sausage",       label:"Italian Sausage" },
  { id:"mushrooms",     label:"Mushrooms" },
  { id:"onions",        label:"Onions" },
  { id:"peppers",       label:"Green Peppers" },
  { id:"olives",        label:"Black Olives" },
  { id:"ham",           label:"Ham" },
  { id:"bacon",         label:"Bacon" },
  { id:"jalapenos",     label:"Jalapeños" },
  { id:"pineapple",     label:"Pineapple" },
  { id:"spinach",       label:"Spinach" },
  { id:"tomatoes",      label:"Fresh Tomatoes" },
  { id:"chicken",       label:"Grilled Chicken" },
  { id:"anchovies",     label:"Anchovies" },
  { id:"roasted_garlic",label:"Roasted Garlic" },
];

// Salad ingredients & dressings
const SALAD_INGREDIENTS = [
  { id:"s_romaine",  label:"Romaine" },         { id:"s_iceberg",  label:"Iceberg Lettuce" },
  { id:"s_spinach",  label:"Baby Spinach" },    { id:"s_tomato",   label:"Tomatoes" },
  { id:"s_cucumber", label:"Cucumber" },        { id:"s_onion",    label:"Red Onion" },
  { id:"s_olives",   label:"Black Olives" },    { id:"s_peppers",  label:"Bell Peppers" },
  { id:"s_croutons", label:"Croutons" },        { id:"s_bacon",    label:"Bacon Bits" },
  { id:"s_chicken",  label:"Grilled Chicken" }, { id:"s_tuna",     label:"Tuna" },
  { id:"s_feta",     label:"Feta Cheese" },     { id:"s_parmesan", label:"Parmesan" },
  { id:"s_egg",      label:"Hard Boiled Egg" }, { id:"s_avocado",  label:"Avocado" },
];
const SALAD_DRESSINGS = [
  { id:"d_caesar",  label:"Caesar" },    { id:"d_ranch",    label:"Ranch" },
  { id:"d_italian", label:"Italian" },   { id:"d_balsamic", label:"Balsamic" },
  { id:"d_greek",   label:"Greek" },     { id:"d_honey",    label:"Honey Mustard" },
  { id:"d_oilvin",  label:"Oil & Vinegar" }, { id:"d_none", label:"No Dressing" },
];
const GRINDER_INGREDIENTS = [
  { id:"g_lettuce",  label:"Lettuce" },         { id:"g_tomato",   label:"Tomatoes" },
  { id:"g_onion",    label:"Onions" },           { id:"g_peppers",  label:"Green Peppers" },
  { id:"g_olives",   label:"Black Olives" },    { id:"g_pickles",  label:"Pickles" },
  { id:"g_jalapenos",label:"Jalapénos" },   { id:"g_banana",   label:"Banana Peppers" },
  { id:"g_mayo",     label:"Mayo" },             { id:"g_mustard",  label:"Mustard" },
  { id:"g_oilvin",   label:"Oil & Vinegar" },   { id:"g_hot",      label:"Hot Sauce" },
  { id:"g_american", label:"American Cheese" }, { id:"g_prov",     label:"Provolone" },
  { id:"g_mozz",     label:"Mozzarella" },       { id:"g_extra",    label:"Extra Meat" },
];

// Get ingredient list for a category
function getIngredientList(cat) {
  if (cat === "pizza")   return ALL_TOPPINGS;
  if (cat === "salad")   return [...SALAD_INGREDIENTS, ...SALAD_DRESSINGS];
  if (cat === "grinder") return GRINDER_INGREDIENTS;
  return [];
}
function hasCustomization(cat) { return ["pizza","salad","grinder"].includes(cat); }
function hasSizes(cat) { return ["pizza","salad","grinder","soda"].includes(cat); }
function getSizes(cat, base) {
  if (cat === "pizza")   return [["S","Small",base],["M","Medium",base+4],["L","Large",base+8],["XL","X-Large",21.99]];
  if (cat === "salad")   return [["S","Small",base],["L","Large",base+2]];
  if (cat === "grinder") return [["6","6 inch",base],["12","12 inch",base+3]];
  if (cat === "soda")    return [["S","Small",1.50],["L","Large",3.00]];
  return [];
}
function getDefaultSize(cat, base) {
  if (cat === "grinder") return { label:"12", price:base+3 };
  if (cat === "soda")    return { label:"S",  price:1.50 };
  if (cat === "salad")   return { label:"S",  price:base };
  return { label:"S", price:base };
}

const EXTRA_PRICE = 0.5;

const CAT_LABEL   = { pizza:"Pizza", salad:"Salad", grinder:"Grinder", side:"Side", soda:"Soda" };
const CAT_COLORS  = {
  pizza:   { bg:"#FEE2E2", text:"#991B1B" },
  salad:   { bg:"#DCFCE7", text:"#14532D" },
  grinder: { bg:"#FEF3C7", text:"#92400E" },
  side:    { bg:"#EDE9FE", text:"#4C1D95" },
  soda:    { bg:"#DBEAFE", text:"#1E3A8A" },
};
function getCategoryColor(catKey) {
  const c = CAT_COLORS[catKey];
  if (c) return { background: c.bg, color: c.text };
  return { background:"#F3F4F6", color:"#374151" };
}
const CAT_FILTERS = [
  { key:"all",     label:"All",      icon:"🍽️" },
  { key:"pizza",   label:"Pizzas",   icon:"🍕" },
  { key:"salad",   label:"Salads",   icon:"🥗" },
  { key:"grinder", label:"Grinders", icon:"🥪" },
  { key:"side",    label:"Sides",    icon:"🍟" },
  { key:"soda",    label:"Sodas",    icon:"🥤" },
];

// ─────────────────────────────────────────────
// RESPONSIVE HOOK
// ─────────────────────────────────────────────
function useBreakpoint() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return { isMobile: width < 640, isTablet: width >= 640 && width < 1024, isDesktop: width >= 1024, width };
}

// ─────────────────────────────────────────────
// GLOBAL CSS
// ─────────────────────────────────────────────
const globalCss = `
@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&display=swap');
*{box-sizing:border-box;margin:0;padding:0;}
html,body{height:100%;overscroll-behavior:none;}
body{font-family:'DM Sans',sans-serif;background:#FFF8F0;color:#1A0A00;}
@keyframes slideIn{from{opacity:0;transform:translateX(20px);}to{opacity:1;transform:translateX(0);}}
@keyframes slideUp{from{opacity:0;transform:translateY(100%);}to{opacity:1;transform:translateY(0);}}
@keyframes cardIn{from{opacity:0;transform:translateY(8px);}to{opacity:1;transform:translateY(0);}}
@keyframes popIn{from{transform:scale(0.8);opacity:0;}to{transform:scale(1);opacity:1;}}
@keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.7;}}
@keyframes cardPulse{0%,100%{transform:scale(1);}50%{transform:scale(1.1);}}
@keyframes spin{to{transform:rotate(360deg);}}
::-webkit-scrollbar{width:4px;}
::-webkit-scrollbar-thumb{background:#D1C4B0;border-radius:4px;}
.slide-in{animation:slideIn 0.2s ease;}
.slide-up{animation:slideUp 0.3s cubic-bezier(0.32,0.72,0,1);}
.card-in{animation:cardIn 0.2s ease;}
.pop-in{animation:popIn 0.3s cubic-bezier(0.34,1.56,0.64,1);}
.pulse-anim{animation:pulse 1s infinite;}
.card-pulse{animation:cardPulse 1.2s infinite;}
.spinner{width:32px;height:32px;border:3px solid #E8D5C0;border-top-color:#E8251A;border-radius:50%;animation:spin 0.8s linear infinite;}
input,select,textarea,button{font-family:'DM Sans',sans-serif;-webkit-appearance:none;}
`;

const darkInput = {
  width:"100%", padding:"9px 11px", background:"#2A1200", border:"1px solid #5A3A1A",
  borderRadius:8, color:"white", fontFamily:"'DM Sans',sans-serif", fontSize:"0.9rem", outline:"none",
};

// ─────────────────────────────────────────────
// MAIN APP
// ─────────────────────────────────────────────
export default function PizzaPOS() {
  const bp = useBreakpoint();

  useEffect(() => {
    const style = document.createElement("style");
    style.textContent = globalCss;
    document.head.appendChild(style);
    let meta = document.querySelector("meta[name=viewport]");
    if (!meta) { meta = document.createElement("meta"); meta.name = "viewport"; document.head.appendChild(meta); }
    meta.content = "width=device-width, initial-scale=1, maximum-scale=1";
    return () => document.head.removeChild(style);
  }, []);

  // ── Pricing config (loaded from Supabase) ──
  const [pricing, setPricing]       = useState({});
  const [categories, setCategories] = useState([
    { key:"pizza",   label:"Pizza",   emoji:"🍕" },
    { key:"salad",   label:"Salad",   emoji:"🥗" },
    { key:"grinder", label:"Grinder", emoji:"🥪" },
    { key:"side",    label:"Side",    emoji:"🍟" },
    { key:"soda",    label:"Soda",    emoji:"🥤" },
  ]); // defaults — overwritten by Supabase on load

  // ── Auth state ──
  const [currentUser, setCurrentUser] = useState(null); // { name, role, loginTime }

  // ── Core state ──
  const [tab, setTab]                         = useState("pos");
  const [products, setProducts]               = useState([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [order, setOrder]                     = useState([]);
  const [fulfillment, setFulfillment]         = useState("pickup");
  const [customerName, setCustomerName]       = useState("");
  const [customerPhone, setCustomerPhone]     = useState("");
  const [customerAddress, setCustomerAddress] = useState("");
  const [orderNotes, setOrderNotes]           = useState("");
  const [placedOrders, setPlacedOrders]       = useState([]);
  const [ordersLoading, setOrdersLoading]     = useState(true);
  const [posFilter, setPosFilter]             = useState("all");
  const [boardFilter, setBoardFilter]         = useState("all");

  // ── Customer lookup state ──
  const [foundCustomer, setFoundCustomer]     = useState(null);
  const [lookingUp, setLookingUp]             = useState(false);
  const phoneTimerRef = useRef(null);

  // ── Modal state ──
  const [modalProduct, setModalProduct]               = useState(null);
  const [modalToppings, setModalToppings]             = useState([]);
  const [modalDefaultToppings, setModalDefaultToppings] = useState([]);
  const [modalSize, setModalSize]                     = useState({ label:"S", price:9.99 });
  const [modalQty, setModalQty]                       = useState(1);

  // ── Payment state ──
  const [clock, setClock]                   = useState("");
  const [activeOverlay, setActiveOverlay]   = useState(null);
  const [pendingOrder, setPendingOrder]     = useState(null);
  const [cardProgress, setCardProgress]     = useState(0);
  const [cardStatus, setCardStatus]         = useState("");
  const [cardApproved, setCardApproved]     = useState(false);
  const [cardApprovalCode, setCardApprovalCode] = useState("");
  const [terminalStatus, setTerminalStatus]   = useState(""); // idle|waiting|approved|declined|error
  const [terminalMessage, setTerminalMessage] = useState("");
  const [terminalIntentId, setTerminalIntentId] = useState(null);
  const [cardMode, setCardMode]               = useState(""); // "terminal" | "form"
  const [stripeClientSecret, setStripeClientSecret] = useState(null);
  const [stripeError, setStripeError]               = useState("");
  const [isRecording, setIsRecording]       = useState(false);
  const [showOrderDrawer, setShowOrderDrawer] = useState(false);
  const [placingOrder, setPlacingOrder]     = useState(false);
  const [pickupPaymentOrder, setPickupPaymentOrder] = useState(null); // board order awaiting pickup payment
  const [editingOrder, setEditingOrder]             = useState(null);   // original board order being edited
  const [incomingCall, setIncomingCall]             = useState(null);   // current call being shown
  const [activeCalls, setActiveCalls]               = useState([]);     // all active calls queue
  const [ctiConnected, setCtiConnected]             = useState(false);  // WebSocket connection status

  const recognitionRef = useRef(null);
  const wsRef          = useRef(null); // WebSocket reference
  const savedTextRef   = useRef("");

  // ── Load products from DB ──
  useEffect(() => {
    getProducts().then(data => {
      setProducts(data);
      setProductsLoading(false);
    });
    loadPricing().then(setPricing);
    getCategories().then(setCategories);
    // Real-time: if manager adds/removes product on another device
    const sub = subscribeToProducts(setProducts);
    return () => sub.unsubscribe();
  }, []);

  // ── Load orders from DB ──
  useEffect(() => {
    getOrders().then(data => {
      setPlacedOrders(data);
      setOrdersLoading(false);
    });
    // Real-time board updates
    const sub = subscribeToOrders(
      // New order placed (from any device)
      (newOrder) => setPlacedOrders(prev => [newOrder, ...prev]),
      // Status updated
      (orderId, status) => setPlacedOrders(prev => prev.map(o => o.id === orderId ? { ...o, status } : o)),
      // Order dismissed/deleted
      (orderId) => setPlacedOrders(prev => prev.filter(o => o.id !== orderId))
    );
    return () => sub.unsubscribe();
  }, []);

  // ── Clock ──
  useEffect(() => {
    const tick = () => setClock(new Date().toLocaleTimeString("en-US", { hour:"2-digit", minute:"2-digit" }));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  // ── CTI: WebSocket connection to Node.js server for incoming calls ──
  useEffect(() => {
    const WS_URL = `ws://${window.location.hostname}:3001`;
    let reconnectTimer = null;

    const connect = () => {
      try {
        const ws = new WebSocket(WS_URL);
        wsRef.current = ws;

        ws.onopen = () => {
          setCtiConnected(true);
          console.log("📞 CTI connected — waiting for incoming calls");
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);

            if (data.type === "incoming_call") {
              console.log("📞 Incoming call from:", data.phone);
              const calls = data.activeCalls || [{ phone: data.phone, callerName: data.callerName }];
              setActiveCalls(calls);
              setIncomingCall({ phone: data.phone, callerName: data.callerName });
              setTab("pos"); // auto switch to POS tab
            }

            if (data.type === "call_ended") {
              const remaining = data.activeCalls || [];
              setActiveCalls(remaining);
              if (remaining.length === 0) {
                setIncomingCall(null); // no more calls
              } else {
                setIncomingCall(remaining[0]); // show next call in queue
              }
            }
          } catch (e) {
            console.error("CTI message parse error:", e);
          }
        };

        ws.onclose = () => {
          setCtiConnected(false);
          wsRef.current = null;
          // Auto reconnect every 5 seconds
          reconnectTimer = setTimeout(connect, 5000);
        };

        ws.onerror = () => {
          ws.close();
        };
      } catch (e) {
        reconnectTimer = setTimeout(connect, 5000);
      }
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (wsRef.current) wsRef.current.close();
    };
  }, []);

  // ── CTI: when call arrives, just switch to POS tab — cashier loads manually ──
  useEffect(() => {
    if (activeCalls.length === 0) return;
    // Just switch to POS tab so cashier sees the banner
    // Nothing auto-fills — cashier clicks "Load" when ready
    setTab("pos");
  }, [activeCalls.length]);

  // ── Phone number lookup (debounced 600ms) ──
  const handlePhoneChange = useCallback((raw) => {
    const formatted = formatPhone(raw);
    setCustomerPhone(formatted);
    setFoundCustomer(null);

    clearTimeout(phoneTimerRef.current);
    const digits = raw.replace(/\D/g, "");
    if (digits.length === 10) {
      setLookingUp(true);
      phoneTimerRef.current = setTimeout(async () => {
        const customer = await lookupCustomer(digits);
        setLookingUp(false);
        if (customer) {
          setFoundCustomer(customer);
          // Always fill name (works for both pickup and delivery)
          if (customer.name) setCustomerName(customer.name);
          // Always fill address with most recent one (works for both fulfillment types)
          // addresses[] is sorted newest first; fall back to defaultAddress
          const bestAddress = (customer.addresses && customer.addresses.length > 0)
            ? customer.addresses[customer.addresses.length - 1]
            : customer.defaultAddress;
          if (bestAddress) setCustomerAddress(bestAddress);
        }
      }, 600);
    }
  }, []);

  // ── Derived ──
  const activeOrderCount = placedOrders.filter(o => o.status !== "sent").length;
  const subtotal = order.reduce((s, i) => s + i.price, 0);
  const tax      = subtotal * 0.08;
  const total    = subtotal + tax;
  const itemCount = order.reduce((s, i) => s + i.qty, 0);
  const filteredMenuProducts = posFilter === "all" ? products : products.filter(p => p.category === posFilter);

  // ── Modal ──
  const openModal = useCallback((product) => {
    const cat = product.category;
    const defToppings = hasCustomization(cat) ? [...(product.defaultToppings||[])] : [];
    setModalProduct(product);
    setModalDefaultToppings(defToppings);
    setModalToppings(defToppings);
    setModalQty(1);
    if (hasSizes(cat)) setModalSize(getDefaultSize(cat, product.price));
    else               setModalSize({ label:"", price:product.price });
  }, []);

  const closeModal = () => setModalProduct(null);

  const toggleModalTopping = (id) =>
    setModalToppings(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  const addToOrder = () => {
    const cat      = modalProduct.category;
    const isCustom = hasCustomization(cat);
    const useSize  = hasSizes(cat);
    const basePrice = useSize ? modalSize.price : modalProduct.price;
    let extrasTotal = 0;

    if (isCustom) {
      const extraIngredients = modalToppings.filter(t => !modalDefaultToppings.includes(t));
      if (cat === "pizza") {
        // Per-size extra price for each additional topping
        const perTopping = getPizzaExtraPrice(pricing, modalSize.label);
        extrasTotal = extraIngredients.length * perTopping;
      } else if (cat === "salad") {
        // Salad: count extra ingredients vs extra dressings separately
        const extraDressings = extraIngredients.filter(id => id.startsWith("d_")).length;
        const extraIngCount  = extraIngredients.filter(id => !id.startsWith("d_")).length;
        extrasTotal = extraIngCount  * (pricing?.salad_extra_ing      ?? 0)
                    + extraDressings * (pricing?.salad_extra_dressing  ?? 0);
      } else if (cat === "grinder") {
        extrasTotal = extraIngredients.length * (pricing?.grinder_extra_ing ?? 0);
      }
    }

    const itemPrice = (basePrice + extrasTotal) * modalQty;
    setOrder(prev => [...prev, {
      id: Date.now(), product: modalProduct,
      defaultToppings: [...modalDefaultToppings], toppings: [...modalToppings],
      size: useSize ? modalSize : null,
      qty: modalQty, price: itemPrice,
    }]);
    closeModal();
  };

  // ── Checkout ──
  // ── Load a board order back into the POS for editing ──
  const handleEditOrder = (boardOrder) => {
    setEditingOrder(boardOrder);          // remember the original so we can update it later
    setFulfillment(boardOrder.fulfillment);
    setCustomerName(boardOrder.name || "");
    setCustomerPhone(boardOrder.phone || "");
    setCustomerAddress(boardOrder.address || "");
    // Rebuild cart items from the saved order
    const rebuilt = (boardOrder.items || []).map(item => ({
      id: Date.now() + Math.random(),
      product: {
        id:       item.product.id,
        name:     item.product.name,
        emoji:    item.product.emoji,
        category: item.product.category,
        price:    item.size ? item.size.price : item.price / Math.max(item.qty, 1),
        defaultToppings: item.defaultToppings || [],
        note:     "",
      },
      defaultToppings: item.defaultToppings || [],
      toppings:        item.toppings || [],
      size:            item.size || null,
      qty:             item.qty,
      price:           item.price,
    }));
    setOrder(rebuilt);
    setTab("pos");
  };

  const handleCheckout = async () => {
    if (fulfillment === "pickup" && !customerName.trim()) {
      alert("Please enter the client name for pickup."); return;
    }
    if (fulfillment === "delivery") {
      if (!customerPhone.trim()) { alert("Please enter the phone number for delivery."); return; }
      if (!customerAddress.trim()) { alert("Please enter the delivery address."); return; }
    }

    // ── EDITING MODE: update the existing board order ──
    if (editingOrder) {
      setPlacingOrder(true);
      const result = await updateOrderItems(editingOrder.id, {
        fulfillment, customerName, customerPhone, customerAddress,
        notes: "", items: order, subtotal, tax, total,
      });
      setPlacingOrder(false);
      if (!result.success) { alert("Error saving changes: " + result.error); return; }
      // Update local state
      setPlacedOrders(prev => prev.map(o => o.id === editingOrder.id
        ? { ...o, fulfillment, name:customerName, phone:customerPhone, address:customerAddress, notes:"", items:order, subtotal, tax, total }
        : o));
      setEditingOrder(null);
      newOrder();
      setTab("board");
      return;
    }

    if (fulfillment === "delivery") {
      // Delivery: take payment now over the phone
      setActiveOverlay("payment");
      setShowOrderDrawer(false);
    } else {
      // Pickup: place order immediately, payment happens when customer picks up
      setPlacingOrder(true);
      setShowOrderDrawer(false);
      const result = await placeOrder({
        fulfillment, customerName, customerPhone, customerAddress,
        notes: "", items: order, subtotal, tax, total,
        paymentMethod: null, // paid on pickup
        staffName: currentUser?.name || "",
      });
      setPlacingOrder(false);
      if (!result.success) { alert("Error placing order: " + result.error); return; }
      setPendingOrder({
        num: result.orderNum, fulfillment,
        name: customerName, phone: customerPhone, address: customerAddress,
        notes: "", items: [...order], subtotal, tax, total,
      });
      setActiveOverlay("orderPlaced");
    }
  };

  // processPayment: used for DELIVERY (payment at order time)
  // and for PICKUP when "Picked Up" is pressed on the board
  const processPayment = async (method) => {
    const isPickupPayment = !!pickupPaymentOrder; // true when triggered from board

    if (isPickupPayment) {
      // Pickup payment: mark as sent and save payment method in DB
      await updateOrderStatus(pickupPaymentOrder.id, "sent", method);
      setPlacedOrders(prev => prev.map(o => o.id === pickupPaymentOrder.id ? { ...o, status:"sent", paymentMethod:method } : o));
      setPendingOrder({ ...pickupPaymentOrder, paymentMethod: method });
    } else {
      // Delivery payment: place the order now
      setPlacingOrder(true);
      const result = await placeOrder({
        fulfillment, customerName, customerPhone, customerAddress,
        notes: "", items: order, subtotal, tax, total,
        paymentMethod: method,
        staffName: currentUser?.name || "",
      });
      setPlacingOrder(false);
      if (!result.success) { alert("Error placing order: " + result.error); setActiveOverlay(null); return; }
      setPendingOrder({
        num: result.orderNum, fulfillment,
        name: customerName, phone: customerPhone, address: customerAddress,
        notes: "", items: [...order], subtotal, tax, total,
      });
    }

    // Capture total BEFORE any state changes clear the cart
    const paymentTotal = isPickupPayment ? pickupPaymentOrder.total : total;
    const paymentOrderNum = isPickupPayment ? pickupPaymentOrder.num : null;

    if (method === "cash") {
      setActiveOverlay("cash");
    } else {
      setCardApproved(false);
      setActiveOverlay("card");

      // ── DELIVERY → Stripe form (card typed in) ──
      // ── PICKUP   → Terminal reader (tap/swipe)  ──
      const useTerminal = isPickupPayment || fulfillment === "pickup";

      if (useTerminal) {
        // Terminal flow
        setCardMode("terminal");
        setTerminalStatus("waiting");
        setTerminalMessage("Creating payment...");
        setTerminalIntentId(null);

        const SB_URL = "https://icyadikqqfcnrxqinqnu.supabase.co";
        const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljeWFkaWtxcWZjbnJ4cWlucW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTgzMTEsImV4cCI6MjA4Nzg3NDMxMX0.aFlC0ZjZVdIPSiHP2WjZkbXO4OXbXHoSiqkpMmyfPgo";
        const READER = "tmr_GalPPgSQIXeYFe";
        const callFn = async (body) => {
          const r = await fetch(`${SB_URL}/functions/v1/terminal-payment`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
            body: JSON.stringify(body),
          });
          return r.json();
        };
        try {
          const stripeAmount = parseFloat(paymentTotal);
          if (!stripeAmount || stripeAmount <= 0) { setTerminalStatus("error"); setTerminalMessage(`Invalid amount: ${paymentTotal}`); return; }
          setTerminalMessage("Creating payment intent...");
          const intent = await callFn({ action: "create_intent", amount: stripeAmount });
          if (intent.error) { setTerminalStatus("error"); setTerminalMessage(intent.error); return; }
          setTerminalIntentId(intent.paymentIntentId);
          setTerminalMessage("Sending to card reader...");
          const present = await callFn({ action: "present_to_reader", readerId: READER, paymentIntentId: intent.paymentIntentId });
          if (present.error) { setTerminalStatus("error"); setTerminalMessage(present.error); return; }
          setTerminalMessage("Waiting for card tap...");
          await callFn({ action: "simulate_payment", readerId: READER });
          setTerminalMessage("Processing payment...");
          let attempts = 0;
          const poll = setInterval(async () => {
            attempts++;
            const check = await callFn({ action: "check_status", paymentIntentId: intent.paymentIntentId });
            if (check.status === "succeeded") {
              clearInterval(poll);
              setCardApproved(true);
              setCardApprovalCode("AUTH-" + intent.paymentIntentId.slice(-8).toUpperCase());
              setTerminalStatus("approved");
              setTerminalMessage("Payment approved!");
            } else if (check.status === "canceled" || check.status === "requires_payment_method") {
              clearInterval(poll); setTerminalStatus("declined"); setTerminalMessage("Payment declined. Please try again.");
            } else if (attempts > 15) {
              clearInterval(poll); setTerminalStatus("error"); setTerminalMessage("Timed out waiting for payment.");
            }
          }, 1500);
        } catch(e) { setTerminalStatus("error"); setTerminalMessage("Could not connect to payment server: " + e.message); }

      } else {
        // Delivery form flow
        setCardMode("form");
        setStripeError("");
        setStripeClientSecret(null);
        try {
          const SB_URL = "https://icyadikqqfcnrxqinqnu.supabase.co";
          const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImljeWFkaWtxcWZjbnJ4cWlucW51Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIyOTgzMTEsImV4cCI6MjA4Nzg3NDMxMX0.aFlC0ZjZVdIPSiHP2WjZkbXO4OXbXHoSiqkpMmyfPgo";
          const stripeAmount = parseFloat(paymentTotal);
          console.log("[Stripe] paymentTotal:", paymentTotal, "parsed:", stripeAmount, "isPickup:", isPickupPayment, "total var:", total);
          if (!stripeAmount || stripeAmount <= 0) { setStripeError(`Amount error: got "${paymentTotal}" (${typeof paymentTotal})`); return; }
          const res = await fetch(`${SB_URL}/functions/v1/create-payment-intent`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": `Bearer ${SB_KEY}` },
            body: JSON.stringify({ amount: stripeAmount, orderId: paymentOrderNum }),
          });
          if (!res.ok) { const t = await res.text(); setStripeError("Server error: " + res.status + " " + t.slice(0,100)); return; }
          const data = await res.json();
          if (data.error) { setStripeError(data.error); return; }
          setStripeClientSecret(data.clientSecret);
        } catch(e) { setStripeError("Could not connect to payment server: " + e.message); }
      }
    }
  };

  const cancelPayment = () => { setActiveOverlay(null); setPickupPaymentOrder(null); };

  const newOrder = () => {
    setOrder([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress("");
    setFulfillment("pickup"); setFoundCustomer(null);
    setPendingOrder(null); setActiveOverlay(null); setPickupPaymentOrder(null);
    setCardApproved(false); setCardProgress(0); setCardMode(""); setStripeClientSecret(null); setStripeError(""); setShowOrderDrawer(false);
    setEditingOrder(null);
  };

  // ── Board actions ──
  const handleSetStatus = async (id, status) => {
    // Pickup orders: when "Picked Up" pressed (done→sent), trigger payment first
    if (status === "sent") {
      const order = placedOrders.find(o => o.id === id);
      if (order && order.fulfillment === "pickup") {
        setPickupPaymentOrder(order);
        setActiveOverlay("payment");
        return; // don't update status yet — payment modal will do it
      }
    }
    await updateOrderStatus(id, status);
    setPlacedOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
  };

  const handleDismiss = async (id) => {
    await dismissOrder(id);
    setPlacedOrders(prev => prev.filter(o => o.id !== id));
  };

  // ── Manager actions ──
  const handleAddProduct = async (product) => {
    const saved = await addProduct(product);
    if (saved) setProducts(prev => [...prev, saved]);
    return !!saved;
  };

  const handleDeleteProduct = async (id) => {
    if (!window.confirm("Remove this product from the menu?")) return;
    const ok = await deleteProduct(id);
    if (ok) setProducts(prev => prev.filter(p => p.id !== id));
  };

  // ── Voice ──
  const toggleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Voice notes require Chrome or Edge."); return; }
    if (isRecording) { recognitionRef.current?.stop(); return; }
    const rec = new SR();
    rec.continuous = true; rec.interimResults = true; rec.lang = "en-US";
    recognitionRef.current = rec;
    savedTextRef.current = "";
    rec.onstart = () => setIsRecording(true);
    rec.onresult = (e) => {
      let fc = "", ic = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) fc += e.results[i][0].transcript;
        else ic += e.results[i][0].transcript;
      }
      if (fc) savedTextRef.current += fc + " ";
      setOrderNotes(savedTextRef.current + ic);
    };
    rec.onerror = (e) => { setIsRecording(false); if (e.error === "not-allowed") alert("Microphone access denied."); };
    rec.onend   = () => { setIsRecording(false); setOrderNotes(savedTextRef.current); };
    rec.start();
  };

  // ── Receipt ──
  const orderSummaryLines = pendingOrder ? (
    <div style={{ background:"#FFF8F0", borderRadius:11, padding:14, textAlign:"left", fontSize:"0.85rem", margin:"12px 0" }}>
      <div style={{ marginBottom:4 }}><strong>Order {pendingOrder.num}</strong> · {pendingOrder.fulfillment === "pickup" ? "🏃 Pickup" : "🛵 Delivery"}</div>
      <div style={{ borderTop:"1px solid #E8D5C0", paddingTop:7, marginTop:7 }}>
        {pendingOrder.items.map((i, idx) => (
          <div key={idx} style={{ color:"#3D1F00", marginBottom:3 }}>
            {i.qty}x {i.size ? i.size.label + " " : ""}{i.product.name} — ${i.price.toFixed(2)}
          </div>
        ))}
      </div>
      <div style={{ borderTop:"1px solid #E8D5C0", paddingTop:7, marginTop:7 }}><strong>Total: ${pendingOrder.total.toFixed(2)}</strong></div>
      {pendingOrder.name && <div style={{ marginTop:5, color:"#3D1F00" }}>👤 {pendingOrder.name}{pendingOrder.phone ? ` · ${pendingOrder.phone}` : ""}</div>}
      {pendingOrder.fulfillment === "delivery" && pendingOrder.address && <div style={{ marginTop:4, color:"#3D1F00" }}>📍 {pendingOrder.address}</div>}
      {pendingOrder.notes && <div style={{ marginTop:4, color:"#3D1F00" }}>📝 {pendingOrder.notes}</div>}
    </div>
  ) : null;

  const navItems = [
    { key:"pos",     icon:"📋", label:"Order" },
    { key:"board",   icon:"📜", label:"Board", badge: activeOrderCount },
    ...(currentUser?.role === "owner" ? [{ key:"manager", icon:"⚙️", label:"Manager" }, { key:"dashboard", icon:"📊", label:"Dashboard" }] : []),
  ];

  // Show login screen if not logged in
  if (!currentUser) {
    return <LoginScreen onLogin={setCurrentUser} />;
  }

  return (
    <div style={{ height:"100vh", display:"flex", flexDirection:"column", fontFamily:"'DM Sans',sans-serif", background:"#FFF8F0", overflow:"hidden" }}>

      {/* ── HEADER ── */}
      <header style={{ background:"#E8251A", height: bp.isMobile ? 50 : 56, padding:`0 ${bp.isMobile ? 14 : 20}px`, display:"flex", alignItems:"stretch", boxShadow:"0 4px 12px rgba(232,37,26,0.3)", flexShrink:0, zIndex:10 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8, paddingRight: bp.isMobile ? 10 : 18, borderRight:"1px solid rgba(255,255,255,0.2)" }}>
          <span style={{ fontSize: bp.isMobile ? "1.2rem" : "1.4rem" }}>🍕</span>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: bp.isMobile ? "1.4rem" : "1.8rem", color:"white", letterSpacing:2 }}>PizzaPOS</span>
        </div>
        {!bp.isMobile && (
          <nav style={{ display:"flex", alignItems:"stretch", marginLeft:6 }}>
            {navItems.map(t => (
              <button key={t.key} onClick={() => setTab(t.key)} style={{ display:"flex", alignItems:"center", gap:7, padding:"0 16px", color: tab === t.key ? "white" : "rgba(255,255,255,0.6)", fontWeight:600, fontSize:"0.85rem", cursor:"pointer", border:"none", borderBottom: tab === t.key ? "3px solid white" : "3px solid transparent", background:"none", transition:"all 0.2s" }}>
                {t.icon} {t.label}
                {t.badge !== undefined && <span style={{ background: tab === t.key ? "white" : "rgba(255,255,255,0.25)", color: tab === t.key ? "#E8251A" : "white", borderRadius:10, padding:"1px 7px", fontSize:"0.7rem", fontWeight:700 }}>{t.badge}</span>}
              </button>
            ))}
          </nav>
        )}
        <div style={{ marginLeft:"auto", color:"rgba(255,255,255,0.85)", fontSize:"0.82rem", fontWeight:500, display:"flex", alignItems:"center", gap:10 }}>
          {/* DB + CTI connection indicators */}
          <span style={{ fontSize:"0.65rem", background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"2px 8px", display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background: productsLoading ? "#FCD34D" : "#4ADE80", display:"inline-block" }} />
            {productsLoading ? "Connecting..." : "Live"}
          </span>
          <span title={ctiConnected ? "Phone system connected" : "Phone system offline"} style={{ fontSize:"0.65rem", background:"rgba(255,255,255,0.15)", borderRadius:10, padding:"2px 8px", display:"flex", alignItems:"center", gap:4 }}>
            <span style={{ width:6, height:6, borderRadius:"50%", background: ctiConnected ? "#4ADE80" : "#F87171", display:"inline-block" }} />
            {ctiConnected ? "📞 CTI" : "📞 Off"}
          </span>
          {clock}
          <div style={{ display:"flex", alignItems:"center", gap:6, borderLeft:"1px solid rgba(255,255,255,0.2)", paddingLeft:10 }}>
            <span style={{ fontSize:"0.78rem", color:"white", fontWeight:600 }}>👤 {currentUser.name}</span>
            <button onClick={() => { setCurrentUser(null); newOrder(); }} style={{ background:"rgba(255,255,255,0.15)", border:"none", borderRadius:8, color:"white", fontSize:"0.7rem", padding:"3px 8px", cursor:"pointer" }}>Sign Out</button>
          </div>
        </div>

      </header>

      {/* ── EDITING ORDER BANNER ── */}
      {editingOrder && (
        <div style={{ background:"#1E40AF", padding:"8px 16px", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
          <div style={{ color:"white", fontSize:"0.85rem", fontWeight:600 }}>
            ✏️ Editing Order {editingOrder.num} &mdash; changes will update the board
          </div>
          <button onClick={() => { setEditingOrder(null); newOrder(); }} style={{ background:"rgba(255,255,255,0.2)", border:"none", borderRadius:8, color:"white", fontSize:"0.75rem", padding:"4px 10px", cursor:"pointer" }}>
            Cancel Edit
          </button>
        </div>
      )}
      {/* ── INCOMING CALL BANNER ── */}
      {activeCalls.length > 0 && (
        <div style={{ background:"#1E3A2F", borderBottom:"2px solid #16A34A", padding:"10px 16px", flexShrink:0, zIndex:15 }}>
          {activeCalls.map((call, i) => (
            <div key={call.linkedid || i} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom: i < activeCalls.length - 1 ? 8 : 0 }}>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ fontSize:"1.3rem" }} className="pulse-anim">📞</span>
                <div>
                  <div style={{ color:"white", fontWeight:700, fontSize:"0.88rem" }}>
                    {call.callerName || "Unknown Caller"}
                  </div>
                  <div style={{ color:"rgba(255,255,255,0.7)", fontSize:"0.75rem" }}>
                    {call.phone ? `(${call.phone.slice(0,3)}) ${call.phone.slice(3,6)}-${call.phone.slice(6)}` : "Unknown"}
                  </div>
                </div>
              </div>
              <div style={{ display:"flex", gap:6, alignItems:"center" }}>
                <button
                  onClick={() => {
                    setTab("pos");
                    handlePhoneChange(call.phone);
                  }}
                  style={{ background:"#16A34A", color:"white", border:"none", borderRadius:8, padding:"6px 12px", fontSize:"0.78rem", fontWeight:700, cursor:"pointer" }}>
                  🔍 Load
                </button>
                <button
                  onClick={() => {
                    setActiveCalls(prev => prev.filter((_, j) => j !== i));
                    if (activeCalls.length === 1) setIncomingCall(null);
                  }}
                  style={{ background:"rgba(255,255,255,0.1)", border:"none", borderRadius:"50%", width:26, height:26, color:"rgba(255,255,255,0.6)", cursor:"pointer", fontSize:"0.8rem", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MAIN ── */}
      <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column", position:"relative", minHeight:0 }}>

        {/* POS PAGE */}
        {tab === "pos" && (
          <div style={{ flex:1, display: bp.isDesktop ? "grid" : "flex", gridTemplateColumns: bp.isDesktop ? "1fr 380px" : undefined, flexDirection:"column", overflow:"hidden" }}>
            <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden", background:"#FFF8F0" }}>
            {/* Mobile: always-visible mini order bar */}
            {bp.isMobile && (
              <div onClick={() => setShowOrderDrawer(true)}
                style={{ background:"#1A0A00", padding:"10px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, cursor:"pointer", borderBottom:"2px solid #3D1F00" }}>
                <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                  <span style={{ fontSize:"1rem" }}>🛒</span>
                  {order.length === 0 ? (
                    <span style={{ color:"#5A3A1A", fontSize:"0.82rem" }}>No items yet</span>
                  ) : (
                    <div style={{ display:"flex", flexDirection:"column" }}>
                      <span style={{ color:"white", fontSize:"0.82rem", fontWeight:600 }}>
                        {order.map(i => `${i.qty > 1 ? i.qty+"x " : ""}${i.size ? i.size.label+" " : ""}${i.product.name}`).join(" · ")}
                      </span>
                      <span style={{ color:"#B89070", fontSize:"0.7rem" }}>{itemCount} item{itemCount !== 1 ? "s" : ""} · tap to edit</span>
                    </div>
                  )}
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:8, flexShrink:0 }}>
                  <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", color:"#F97316", letterSpacing:1 }}>${total.toFixed(2)}</span>
                  {order.length > 0 && (
                    <button onClick={e => { e.stopPropagation(); handleCheckout(); }}
                      style={{ background:"#E8251A", color:"white", border:"none", borderRadius:8, padding:"6px 12px", fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.9rem", letterSpacing:1, cursor:"pointer" }}>
                      ORDER
                    </button>
                  )}
                </div>
              </div>
            )}
            {/* Category filters — pinned on mobile, scrolls with content on desktop */}
            {bp.isMobile ? (
              <div style={{ display:"flex", gap:6, flexWrap:"nowrap", overflowX:"auto", padding:"8px 12px", background:"#FFF8F0", borderBottom:"1px solid #E8D5C0", flexShrink:0, WebkitOverflowScrolling:"touch" }}>
                {[{ key:"all", label:"All", icon:"🍽️" }, ...categories.map(c => ({ key:c.key, label:c.label+"s", icon:c.emoji }))].map(f => (
                  <button key={f.key} onClick={() => setPosFilter(f.key)} style={{ flexShrink:0, padding:"6px 12px", borderRadius:20, border:`1.5px solid ${posFilter === f.key ? "#1A0A00" : "#E8D5C0"}`, background: posFilter === f.key ? "#1A0A00" : "white", color: posFilter === f.key ? "white" : "#7A5C40", fontSize:"0.82rem", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap" }}>
                    {f.icon} {f.label}
                  </button>
                ))}
              </div>
            ) : null}

            <div style={{ flex:1, padding: bp.isMobile ? "10px 12px 0" : "16px 20px 0", overflowY:"auto", display:"flex", flexDirection:"column", gap: bp.isMobile ? 8 : 12 }}>
              {/* Category filters — desktop/tablet */}
              {!bp.isMobile && (
                <div style={{ display:"flex", gap:6, flexWrap:"nowrap", overflowX:"auto", paddingBottom:4, WebkitOverflowScrolling:"touch", flexShrink:0 }}>
                  {[{ key:"all", label:"All", icon:"🍽️" }, ...categories.map(c => ({ key:c.key, label:c.label+"s", icon:c.emoji }))].map(f => {
                    const active = posFilter === f.key;
                    return (
                      <button key={f.key} onClick={() => setPosFilter(f.key)} style={{ flexShrink:0, padding:"5px 12px", borderRadius:20, border:`1.5px solid ${active ? "#1A0A00" : "#E8D5C0"}`, background: active ? "#1A0A00" : "white", color: active ? "white" : "#7A5C40", fontSize:"0.78rem", fontWeight:600, cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s" }}>
                        {f.icon} {f.label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Loading state */}
              {productsLoading ? (
                <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", padding:"60px 20px", gap:14 }}>
                  <div className="spinner" />
                  <p style={{ color:"#7A5C40", fontSize:"0.9rem" }}>Loading menu from database...</p>
                </div>
              ) : filteredMenuProducts.length === 0 ? (
                <div style={{ textAlign:"center", padding:"40px 20px", color:"#7A5C40", fontSize:"0.9rem" }}>No items here yet. Add some in the Manager tab!</div>
              ) : bp.isMobile ? (
                  <div style={{ display:"flex", flexDirection:"column", gap:5, paddingBottom:8 }}>
                    {filteredMenuProducts.map(p => <MenuCardMobile key={p.id} product={p} onOpen={openModal} />)}
                  </div>
              ) : (
                  <div style={{ display:"grid", gridTemplateColumns: bp.isTablet ? "repeat(3,1fr)" : "repeat(auto-fill,minmax(170px,1fr))", gap:12, paddingBottom:16 }}>
                    {filteredMenuProducts.map(p => <MenuCard key={p.id} product={p} onOpen={openModal} isMobile={false} />)}
                  </div>
              )}
            </div>{/* end scrollable area */}
            </div>{/* end left column */}
            {bp.isDesktop && (
              <OrderPanel
                order={order} setOrder={setOrder} fulfillment={fulfillment} setFulfillment={setFulfillment}
                customerName={customerName} setCustomerName={setCustomerName}
                customerPhone={customerPhone} onPhoneChange={handlePhoneChange}
                customerAddress={customerAddress} setCustomerAddress={setCustomerAddress}
                foundCustomer={foundCustomer} lookingUp={lookingUp}
                itemCount={itemCount} subtotal={subtotal} tax={tax} total={total}
                isEditing={!!editingOrder} onCheckout={handleCheckout} onClear={() => { if (window.confirm("Clear the entire order?")) { setOrder([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setOrderNotes(""); setFoundCustomer(null); }}} isMobile={false}
              />
            )}

            {bp.isTablet && (
              <TabletOrderBar
                order={order} setOrder={setOrder} fulfillment={fulfillment} setFulfillment={setFulfillment}
                customerName={customerName} setCustomerName={setCustomerName}
                customerPhone={customerPhone} onPhoneChange={handlePhoneChange}
                customerAddress={customerAddress} setCustomerAddress={setCustomerAddress}
                foundCustomer={foundCustomer} lookingUp={lookingUp}
                itemCount={itemCount} subtotal={subtotal} tax={tax} total={total}
                isEditing={!!editingOrder} onCheckout={handleCheckout} onClear={() => { setOrder([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setOrderNotes(""); setFoundCustomer(null); }}
              />
            )}
          </div>
        )}

        {/* BOARD PAGE */}
        {tab === "board" && (
          <BoardPage
            onEdit={handleEditOrder}
            placedOrders={placedOrders} boardFilter={boardFilter} setBoardFilter={setBoardFilter}
            setStatus={handleSetStatus} onDismiss={handleDismiss}
            isMobile={bp.isMobile} loading={ordersLoading}
          />
        )}

        {/* DASHBOARD PAGE */}
        {tab === "dashboard" && currentUser?.role === "owner" && (
          <DashboardPage isMobile={bp.isMobile} />
        )}

        {/* MANAGER PAGE */}
        {tab === "manager" && (
          <ManagerPage products={products} categories={categories} onCategoriesChange={setCategories} onAdd={handleAddProduct} onDelete={handleDeleteProduct} pricing={pricing} onPricingChange={(id,val) => { setPricing(p => ({...p, [id]:val})); savePricing(id,val); }} onPricingBatch={(updates) => { setPricing(p => ({...p,...updates})); savePricingBatch(updates); }} isMobile={bp.isMobile} isTablet={bp.isTablet} />
        )}
      </div>

      {/* MOBILE BOTTOM NAV */}
      {bp.isMobile && (
        <nav style={{ display:"flex", background:"#1A0A00", borderTop:"2px solid #E8251A", flexShrink:0, zIndex:20 }}>
          {navItems.map(t => (
            <button key={t.key} onClick={() => { setTab(t.key); setShowOrderDrawer(false); }} style={{ flex:1, padding:"10px 4px 8px", display:"flex", flexDirection:"column", alignItems:"center", gap:3, background:"none", border:"none", cursor:"pointer", borderTop: tab === t.key ? "2px solid #E8251A" : "2px solid transparent", marginTop:-2 }}>
              <span style={{ fontSize:"1.2rem", position:"relative" }}>
                {t.icon}
                {t.badge > 0 && <span style={{ position:"absolute", top:-4, right:-6, background:"#E8251A", color:"white", borderRadius:"50%", width:14, height:14, fontSize:"0.55rem", fontWeight:700, display:"flex", alignItems:"center", justifyContent:"center" }}>{t.badge}</span>}
              </span>
              <span style={{ fontSize:"0.65rem", fontWeight:600, color: tab === t.key ? "white" : "rgba(255,255,255,0.5)" }}>{t.label}</span>
            </button>
          ))}
        </nav>
      )}

      {/* MOBILE ORDER DRAWER */}
      {bp.isMobile && showOrderDrawer && (
        <>
          <div onClick={() => setShowOrderDrawer(false)} style={{ position:"fixed", inset:0, background:"rgba(26,10,0,0.5)", zIndex:40 }} />
          <div className="slide-up" style={{ position:"fixed", bottom:0, left:0, right:0, background:"#1A0A00", borderRadius:"20px 20px 0 0", maxHeight:"92vh", display:"flex", flexDirection:"column", zIndex:50, overflow:"hidden" }}>
            <div style={{ padding:"12px 16px 0", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:2, color:"white" }}>Current Order</span>
              <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                <span style={{ background:"#E8251A", color:"white", borderRadius:12, padding:"2px 10px", fontSize:"0.8rem", fontWeight:600 }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
                <button onClick={() => setShowOrderDrawer(false)} style={{ background:"#3D1F00", border:"none", borderRadius:"50%", width:28, height:28, color:"#B89070", fontSize:"1rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>✕</button>
              </div>
            </div>
            <div style={{ flex:1, overflowY:"auto" }}>
              <OrderPanel
                order={order} setOrder={setOrder} fulfillment={fulfillment} setFulfillment={setFulfillment}
                customerName={customerName} setCustomerName={setCustomerName}
                customerPhone={customerPhone} onPhoneChange={handlePhoneChange}
                customerAddress={customerAddress} setCustomerAddress={setCustomerAddress}
                foundCustomer={foundCustomer} lookingUp={lookingUp}
                itemCount={itemCount} subtotal={subtotal} tax={tax} total={total}
                isEditing={!!editingOrder} onCheckout={handleCheckout} onClear={() => { setOrder([]); setCustomerName(""); setCustomerPhone(""); setCustomerAddress(""); setOrderNotes(""); setFoundCustomer(null); }}
                isMobile={true} hideHeader
              />
            </div>
          </div>
        </>
      )}

      {/* ITEM MODAL */}
      {modalProduct && (
        <div onClick={(e) => { if (e.target === e.currentTarget) closeModal(); }} style={{ position:"fixed", inset:0, background:"rgba(26,10,0,0.6)", zIndex:100, display:"flex", alignItems: bp.isMobile ? "flex-end" : "center", justifyContent:"center" }}>
          <div className={bp.isMobile ? "slide-up" : "pop-in"} style={{ background:"white", borderRadius: bp.isMobile ? "20px 20px 0 0" : 18, padding: bp.isMobile ? "20px 16px 28px" : 24, width: bp.isMobile ? "100%" : 480, maxHeight: bp.isMobile ? "90vh" : "88vh", overflowY:"auto", boxShadow:"0 20px 60px rgba(0,0,0,0.3)" }}>
            <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:3 }}>
              <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.6rem", letterSpacing:2, color:"#1A0A00" }}>{modalProduct.emoji} {modalProduct.name}</h2>
              <button onClick={closeModal} style={{ background:"#F3F4F6", border:"none", borderRadius:"50%", width:30, height:30, cursor:"pointer", fontSize:"0.9rem", color:"#7A5C40", flexShrink:0, marginLeft:8 }}>✕</button>
            </div>
            <p style={{ color:"#7A5C40", fontSize:"0.8rem", marginBottom:14 }}>
              {hasCustomization(modalProduct.category)
                ? (modalProduct.category === "pizza" ? "Uncheck toppings you don't want — extra toppings +$0.50 each" : "Customize your order below")
                : hasSizes(modalProduct.category) ? "Choose your size"
                : `$${modalProduct.price.toFixed(2)} each${modalProduct.note ? " — " + modalProduct.note : ""}`}
            </p>

            {/* ── SIZES ── */}
            {hasSizes(modalProduct.category) && (
              <div style={{ display:"grid", gridTemplateColumns: ["salad","grinder","soda"].includes(modalProduct.category) ? "1fr 1fr" : "repeat(4,1fr)", gap:7, marginBottom:14 }}>
                {getSizes(modalProduct.category, modalProduct.price).map(([lbl, name, price]) => (
                  <SizeBtn key={lbl} label={name} price={price} selected={modalSize.label === lbl} onClick={() => setModalSize({ label:lbl, price })} />
                ))}
              </div>
            )}

            {/* ── INGREDIENTS / TOPPINGS ── */}
            {hasCustomization(modalProduct.category) && (() => {
              const cat       = modalProduct.category;
              const isSalad   = cat === "salad";
              const allIng    = getIngredientList(cat);
              const ingItems  = isSalad ? allIng.filter(i => !i.id.startsWith("d_")) : allIng;
              const dressings = isSalad ? allIng.filter(i => i.id.startsWith("d_"))  : [];
              return (
                <div style={{ marginBottom:4 }}>
                  <h4 style={{ fontWeight:600, fontSize:"0.8rem", color:"#3D1F00", marginBottom:8, textTransform:"uppercase", letterSpacing:1 }}>
                    {cat === "pizza" ? "Toppings" : isSalad ? "Ingredients" : "Customize"}
                  </h4>
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
                    {ingItems.map(t => {
                      const isChecked   = modalToppings.includes(t.id);
                      const isExtra     = isChecked && !modalDefaultToppings.includes(t.id);
                      // For pizza: show per-size price. For salad/grinder: show premium price if set
                      const isPizza     = modalProduct.category === "pizza";
                      const extraPrice  = isPizza ? getPizzaExtraPrice(pricing, modalSize.label) : 0;
                      const showBadge   = isPizza && isExtra;
                      const badgeText   = `+$${extraPrice.toFixed(2)}`;
                      return (
                        <div key={t.id} onClick={() => toggleModalTopping(t.id)} style={{ display:"flex", alignItems:"center", padding:"8px 9px", borderRadius:9, background: isChecked ? "#FFF0D0" : "#FFF8F0", border: isChecked ? "1.5px solid #F97316" : "1.5px solid transparent", cursor:"pointer", userSelect:"none", minHeight:40 }}>
                          <input type="checkbox" checked={isChecked} readOnly style={{ accentColor:"#EA6B00", width:15, height:15, flexShrink:0, marginRight:7, pointerEvents:"none" }} />
                          <span style={{ fontSize:"0.82rem", flex:1 }}>{t.label}</span>
                          {showBadge && <span style={{ background:"#F97316", color:"white", fontSize:"0.58rem", padding:"1px 5px", borderRadius:4, fontWeight:700, marginLeft:"auto" }}>{badgeText}</span>}
                        </div>
                      );
                    })}
                  </div>
                  {/* Dressing selector for salads — radio style, one at a time */}
                  {isSalad && dressings.length > 0 && (
                    <>
                      <h4 style={{ fontWeight:600, fontSize:"0.8rem", color:"#14532D", margin:"12px 0 8px", textTransform:"uppercase", letterSpacing:1 }}>Dressing</h4>
                      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:5 }}>
                        {dressings.map(t => {
                          const isChecked = modalToppings.includes(t.id);
                          return (
                            <div key={t.id} onClick={() => setModalToppings(prev => [...prev.filter(id => !id.startsWith("d_")), ...(isChecked ? [] : [t.id])])}
                              style={{ display:"flex", alignItems:"center", padding:"8px 9px", borderRadius:9, background: isChecked ? "#F0FDF4" : "#F8FAFF", border: isChecked ? "1.5px solid #16A34A" : "1.5px solid transparent", cursor:"pointer", userSelect:"none", minHeight:40 }}>
                              <input type="radio" checked={isChecked} readOnly style={{ accentColor:"#16A34A", width:15, height:15, flexShrink:0, marginRight:7, pointerEvents:"none" }} />
                              <span style={{ fontSize:"0.82rem" }}>{t.label}</span>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            <div style={{ display:"flex", alignItems:"center", gap:14, margin:"14px 0" }}>
              <label style={{ fontWeight:600, fontSize:"0.9rem" }}>Qty:</label>
              <button onClick={() => setModalQty(q => Math.max(1, q - 1))} style={{ width:36, height:36, borderRadius:"50%", border:"2px solid #E8D5C0", background:"white", cursor:"pointer", fontSize:"1.1rem", display:"flex", alignItems:"center", justifyContent:"center" }}>−</button>
              <span style={{ fontWeight:700, fontSize:"1.1rem", minWidth:24, textAlign:"center" }}>{modalQty}</span>
              <button onClick={() => setModalQty(q => q + 1)} style={{ width:36, height:36, borderRadius:"50%", border:"2px solid #E8D5C0", background:"white", cursor:"pointer", fontSize:"1.1rem", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
            </div>
            <div style={{ display:"flex", gap:9, marginTop:14 }}>
              <button onClick={closeModal} style={{ flex:1, padding:12, border:"2px solid #E8D5C0", borderRadius:10, background:"white", cursor:"pointer", fontSize:"0.9rem", color:"#3D1F00" }}>Cancel</button>
              <button onClick={addToOrder} style={{ flex:2, padding:12, border:"none", borderRadius:10, background:"#E8251A", color:"white", cursor:"pointer", fontSize:"0.95rem", fontWeight:600 }}>Add to Order</button>
            </div>
          </div>
        </div>
      )}

      {/* ORDER PLACED (PICKUP) — no payment yet, happens on pickup */}
      {activeOverlay === "orderPlaced" && (
        <Overlay isMobile={bp.isMobile}>
          <div className="pop-in" style={{ background:"white", borderRadius: bp.isMobile ? "20px 20px 0 0" : 22, padding: bp.isMobile ? "28px 20px 36px" : 36, textAlign:"center", width: bp.isMobile ? "100%" : undefined, maxWidth: bp.isMobile ? undefined : 400 }}>
            <div style={{ fontSize:"3.2rem", marginBottom:12 }}>✅</div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.9rem", letterSpacing:2, color:"#1A0A00", marginBottom:6 }}>Order Placed!</h2>
            <div style={{ background:"#FEF3C7", border:"1.5px solid #D97706", borderRadius:10, padding:"8px 14px", display:"inline-flex", alignItems:"center", gap:7, marginBottom:10 }}>
              <span>🏃</span>
              <span style={{ fontWeight:700, color:"#92400E", fontSize:"0.9rem" }}>Payment collected on pickup</span>
            </div>
            {orderSummaryLines}
            <button onClick={newOrder} style={{ background:"#E8251A", color:"white", border:"none", borderRadius:11, padding:"13px 28px", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:2, cursor:"pointer", marginTop:6, width:"100%" }}>NEW ORDER</button>
            <button onClick={() => { newOrder(); setTab("board"); }} style={{ marginTop:8, background:"none", border:"none", color:"#7A5C40", fontSize:"0.82rem", cursor:"pointer", textDecoration:"underline" }}>View Orders Board</button>
          </div>
        </Overlay>
      )}

      {/* PAYMENT MODAL */}
      {activeOverlay === "payment" && (
        <Overlay isMobile={bp.isMobile}>
          <div className="pop-in" style={{ background:"white", borderRadius: bp.isMobile ? "20px 20px 0 0" : 22, padding: bp.isMobile ? "28px 20px 36px" : 36, textAlign:"center", width: bp.isMobile ? "100%" : undefined, maxWidth: bp.isMobile ? undefined : 380 }}>
            {placingOrder ? (
              <div style={{ padding:"20px 0" }}>
                <div className="spinner" style={{ margin:"0 auto 14px" }} />
                <p style={{ color:"#7A5C40" }}>Saving order...</p>
              </div>
            ) : (
              <>
                <div style={{ fontSize:"2.5rem", marginBottom:10 }}>💳</div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:2, color:"#1A0A00", marginBottom:6 }}>
                  {pickupPaymentOrder ? "Collect Payment" : "Payment Method"}
                </h2>
                <p style={{ color:"#7A5C40", fontSize:"0.85rem", margin:"6px 0 18px" }}>
                  {pickupPaymentOrder
                    ? `Order ${pickupPaymentOrder.num} — $${pickupPaymentOrder.total.toFixed(2)} — ${pickupPaymentOrder.name || "Customer"} is here to pick up`
                    : "How would the customer like to pay?"}
                </p>
                <div style={{ display:"flex", gap:12, marginBottom:10 }}>
                  <PayBtn icon="💵" label="CASH" sub="Collect from customer" bg="#F0FDF4" border="#16A34A" textColor="#14532D" onClick={() => processPayment("cash")} />
                  <PayBtn icon="💳" label="CARD" sub={pickupPaymentOrder || fulfillment==="pickup" ? "Send to card reader" : "Enter card details"} bg="#EFF6FF" border="#2563EB" textColor="#1E3A8A" onClick={() => processPayment("card")} />
                </div>
                <button onClick={cancelPayment} style={{ background:"none", border:"none", color:"#7A5C40", fontSize:"0.85rem", cursor:"pointer", textDecoration:"underline" }}>Cancel</button>
              </>
            )}
          </div>
        </Overlay>
      )}

      {/* CARD MODAL — Stripe Terminal */}
      {activeOverlay === "card" && (
        <Overlay isMobile={bp.isMobile}>
          <div className="pop-in" style={{ background:"white", borderRadius: bp.isMobile ? "20px 20px 0 0" : 22, padding: bp.isMobile ? "20px 18px 32px" : "32px 40px", textAlign:"center", width: bp.isMobile ? "100%" : 560, maxWidth: bp.isMobile ? undefined : "92vw", maxHeight: bp.isMobile ? "92vh" : "88vh", overflowY:"auto", WebkitOverflowScrolling:"touch" }}>
            {!cardApproved ? (
              <>
                {cardMode === "terminal" ? (
                  /* ── PICKUP: Terminal reader UI ── */
                  <>
                    <div style={{ fontSize:"3.5rem", marginBottom:12,
                      animation: terminalStatus === "waiting" ? "cardPulse 1.2s infinite" : "none" }}>
                      {terminalStatus === "error" || terminalStatus === "declined" ? "❌" : "🖥️"}
                    </div>
                    <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.2rem", color:"#1A0A00", letterSpacing:3, marginBottom:6 }}>
                      {terminalStatus === "error" ? "Payment Error" : terminalStatus === "declined" ? "Payment Declined" : "Card Reader"}
                    </h2>
                    <p style={{ color:"#1A0A00", fontSize:"1.4rem", fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, marginBottom:20 }}>
                      Total: <span style={{ color:"#E8251A" }}>${(pendingOrder?.total || total).toFixed(2)}</span>
                    </p>
                    <div style={{ background:"#FFF8F0", borderRadius:12, padding:"16px 20px", marginBottom:20, textAlign:"left" }}>
                      {[
                        ["Creating payment intent",  ["waiting","approved","declined","error"]],
                        ["Sending to card reader",    ["approved","declined","error"]],
                        ["Waiting for card tap",      ["approved","declined","error"]],
                        ["Processing payment",        ["approved"]],
                      ].map(([label, doneStates], i) => {
                        const isDone   = doneStates.includes(terminalStatus);
                        const isActive = terminalMessage.toLowerCase().includes(label.toLowerCase().split(" ")[0]);
                        return (
                          <div key={i} style={{ display:"flex", alignItems:"center", gap:10, marginBottom: i < 3 ? 10 : 0 }}>
                            <div style={{ width:22, height:22, borderRadius:"50%", flexShrink:0, display:"flex", alignItems:"center", justifyContent:"center",
                              background: isDone ? "#16A34A" : isActive ? "#F97316" : "#E8D5C0", fontSize:"0.7rem", color:"white", fontWeight:700 }}>
                              {isDone ? "✓" : i + 1}
                            </div>
                            <span style={{ fontSize:"0.85rem", color: isDone ? "#16A34A" : isActive ? "#F97316" : "#7A5C40", fontWeight: isDone || isActive ? 600 : 400 }}>{label}</span>
                            {isActive && <span className="pulse-anim" style={{ marginLeft:"auto", fontSize:"0.65rem", color:"#F97316" }}>●</span>}
                          </div>
                        );
                      })}
                    </div>
                    {(terminalStatus === "error" || terminalStatus === "declined") && (
                      <div style={{ background:"#FEE2E2", color:"#991B1B", borderRadius:8, padding:"10px 14px", fontSize:"0.85rem", marginBottom:16 }}>{terminalMessage}</div>
                    )}
                    <button onClick={cancelPayment} style={{ background:"none", border:"none", color:"#7A5C40", fontSize:"0.85rem", cursor:"pointer", textDecoration:"underline" }}>Cancel</button>
                  </>
                ) : (
                  /* ── DELIVERY: Stripe card form ── */
                  <>
                    <div style={{ fontSize:"3rem", marginBottom:10 }}>💳</div>
                    <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.4rem", color:"#1A0A00", letterSpacing:3, marginBottom:6 }}>Card Payment</h2>
                    <p style={{ color:"#1A0A00", fontSize:"1.4rem", fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, marginBottom:20 }}>
                      Total: <span style={{ color:"#E8251A" }}>${(pendingOrder?.total || total).toFixed(2)}</span>
                    </p>
                    {stripeError && (
                      <div style={{ background:"#FEE2E2", color:"#991B1B", borderRadius:8, padding:"8px 12px", fontSize:"0.82rem", marginBottom:14 }}>{stripeError}</div>
                    )}
                    {!stripeClientSecret ? (
                      <div style={{ padding:"20px 0", color:"#7A5C40", fontSize:"0.85rem" }}>
                        <div className="spinner" style={{ margin:"0 auto 12px" }} />
                        Preparing payment...
                      </div>
                    ) : (
                      <StripeForm
                        clientSecret={stripeClientSecret}
                        publishableKey="pk_test_51T5bnEGMr9Lzx6uZ4nU5cMA9xpvep1VAZEuLwEUIsfDnrnF0BiBeFginaWpXEK0jrksIuIrzirk04poMYq8q34KN00KBazUECM"
                        onSuccess={(paymentIntent) => {
                          setCardApprovalCode("AUTH-" + paymentIntent.id.slice(-8).toUpperCase());
                          setCardApproved(true);
                        }}
                        onError={(msg) => setStripeError(msg)}
                      />
                    )}
                    <button onClick={cancelPayment} style={{ marginTop:14, background:"none", border:"none", color:"#7A5C40", fontSize:"0.82rem", cursor:"pointer", textDecoration:"underline" }}>Cancel</button>
                  </>
                )}
              </>
            ) : (
              <>
                <div style={{ fontSize:"3.5rem", marginBottom:12 }}>✅</div>
                <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2rem", letterSpacing:2, color:"#16A34A", marginBottom:6 }}>Approved!</h2>
                <p style={{ color:"#7A5C40", fontSize:"0.85rem" }}>Card Payment Successful</p>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1rem", color:"#7A5C40", letterSpacing:2, marginBottom:16 }}>{cardApprovalCode}</div>
                {orderSummaryLines}
                <button onClick={newOrder} style={{ background:"#E8251A", color:"white", border:"none", borderRadius:11, padding:"14px 28px", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:2, cursor:"pointer", marginTop:8, width:"100%" }}>NEW ORDER</button>
                <button onClick={() => { newOrder(); setTab("board"); }} style={{ marginTop:8, background:"none", border:"none", color:"#7A5C40", fontSize:"0.82rem", cursor:"pointer", textDecoration:"underline" }}>View Orders Board</button>
              </>
            )}
          </div>
        </Overlay>
      )}

      {/* CASH MODAL */}
      {activeOverlay === "cash" && (
        <Overlay isMobile={bp.isMobile}>
          <div className="pop-in" style={{ background:"white", borderRadius: bp.isMobile ? "20px 20px 0 0" : 22, padding: bp.isMobile ? "28px 20px 36px" : 36, textAlign:"center", width: bp.isMobile ? "100%" : undefined, maxWidth: bp.isMobile ? undefined : 400, overflowY:"auto", maxHeight: bp.isMobile ? "80vh" : undefined }}>
            <div style={{ fontSize:"3.2rem", marginBottom:12 }}>✓</div>
            <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.9rem", letterSpacing:2, color:"#16A34A", marginBottom:6 }}>Order Placed!</h2>
            <div style={{ background:"#F0FDF4", border:"1.5px solid #16A34A", borderRadius:10, padding:"8px 14px", display:"inline-flex", alignItems:"center", gap:7, marginBottom:8 }}>
              <span>💵</span><span style={{ fontWeight:700, color:"#14532D", fontSize:"0.9rem" }}>Cash Payment</span>
            </div>
            {orderSummaryLines}
            <button onClick={newOrder} style={{ background:"#E8251A", color:"white", border:"none", borderRadius:11, padding:"13px 28px", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:2, cursor:"pointer", marginTop:6, width:"100%" }}>NEW ORDER</button>
            <button onClick={() => { newOrder(); setTab("board"); }} style={{ marginTop:8, background:"none", border:"none", color:"#7A5C40", fontSize:"0.82rem", cursor:"pointer", textDecoration:"underline" }}>View Orders Board</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MENU CARD
// ─────────────────────────────────────────────
function MenuCard({ product:p, onOpen, isMobile, categories=[] }) {
  const cc = getCategoryColor(p.category);
  const isPizza = p.category === "pizza";
  const subText = isPizza
    ? (p.defaultToppings.length ? p.defaultToppings.map(t => getIngredientList(p.category).find(x => x.id === t)?.label || "").filter(Boolean).join(", ") : (p.category === "pizza" ? "Choose toppings" : "Customize"))
    : (p.note || "");
  const [hovered, setHovered] = useState(false);
  return (
    <div onClick={() => onOpen(p)} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{ background:"white", borderRadius: isMobile ? 12 : 14, padding: isMobile ? 10 : 14, cursor:"pointer", border:`2px solid ${hovered ? "#F97316" : "transparent"}`, transition:"all 0.2s", boxShadow: hovered ? "0 6px 20px rgba(249,115,22,0.15)" : "0 2px 8px rgba(0,0,0,0.06)", position:"relative", transform: hovered ? "translateY(-2px)" : "none" }}>
      <span style={{ ...cc, fontSize:"0.58rem", fontWeight:700, padding:"2px 5px", borderRadius:5, textTransform:"uppercase", letterSpacing:0.5, position:"absolute", top: isMobile ? 6 : 8, left: isMobile ? 6 : 8 }}>{categories.find(c=>c.key===p.category)?.label || p.category}</span>
      <button onClick={(e) => { e.stopPropagation(); onOpen(p); }} style={{ position:"absolute", top: isMobile ? 6 : 10, right: isMobile ? 6 : 10, background:"#E8251A", color:"white", border:"none", width: isMobile ? 24 : 26, height: isMobile ? 24 : 26, borderRadius:"50%", fontSize:"0.95rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center" }}>+</button>
      <span style={{ fontSize: isMobile ? "1.8rem" : "2.2rem", marginBottom: isMobile ? 5 : 7, display:"block", marginTop:16 }}>{p.emoji}</span>
      <div style={{ fontWeight:600, fontSize: isMobile ? "0.82rem" : "0.9rem", color:"#1A0A00", marginBottom:2 }}>{p.name}</div>
      {!isMobile && <div style={{ fontSize:"0.72rem", color:"#7A5C40", marginBottom:6, lineHeight:1.4 }}>{subText}</div>}
      {!isMobile && !isPizza && p.note && <div style={{ fontSize:"0.68rem", color:"#D97706", fontStyle:"italic", marginTop:3, lineHeight:1.3 }}>ℹ {p.note}</div>}
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: isMobile ? "1rem" : "1.2rem", color:"#E8251A", letterSpacing:1 }}>${p.price.toFixed(2)}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SIZE BUTTON
// ─────────────────────────────────────────────

// ─────────────────────────────────────────────
// MENU CARD MOBILE — compact list row, no emoji
// ─────────────────────────────────────────────
function MenuCardMobile({ product:p, onOpen, categories=[] }) {
  const cc = CAT_COLORS[p.category] || { bg:"#F3F4F6", text:"#374151" };
  const isPizza = p.category === "pizza";
  const [pressed, setPressed] = useState(false);
  return (
    <div onClick={() => onOpen(p)}
      onTouchStart={() => setPressed(true)} onTouchEnd={() => setPressed(false)}
      style={{ background: pressed ? "#FFF0EF" : "white", borderRadius:10, padding:"9px 12px", display:"flex", alignItems:"center", gap:10, cursor:"pointer", border:`1.5px solid ${pressed ? "#F97316" : "#E8D5C0"}`, transition:"all 0.15s", boxShadow:"0 1px 4px rgba(0,0,0,0.05)" }}>
      {/* Category dot */}
      <span style={{ width:8, height:8, borderRadius:"50%", background:cc.text, flexShrink:0 }} />
      {/* Name + note */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontWeight:600, fontSize:"0.88rem", color:"#1A0A00", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.name}</div>
        {p.note && !isPizza && <div style={{ fontSize:"0.68rem", color:"#D97706", fontStyle:"italic", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.note}</div>}
        {["pizza","salad","grinder"].includes(p.category) && p.defaultToppings?.length > 0 && <div style={{ fontSize:"0.68rem", color:"#7A5C40", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{p.defaultToppings.map(t => getIngredientList(p.category).find(x => x.id === t)?.label||"").filter(Boolean).join(", ")}</div>}
      </div>
      {/* Price */}
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.05rem", color:"#E8251A", letterSpacing:1, flexShrink:0 }}>${p.price.toFixed(2)}</div>
      {/* Add button */}
      <button onClick={e => { e.stopPropagation(); onOpen(p); }}
        style={{ background:"#E8251A", color:"white", border:"none", width:26, height:26, borderRadius:"50%", fontSize:"1rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>+</button>
    </div>
  );
}



// ─────────────────────────────────────────────
// NOTES SECTION
// Hidden by default — opens on click and
// voice starts immediately, transcript goes
// straight into the notes field
// ─────────────────────────────────────────────
function NotesSection({ orderNotes, setOrderNotes, isRecording, onToggleVoice }) {
  const [open, setOpen] = useState(false);

  const handleOpen = () => {
    setOpen(true);
    // Start voice immediately when notes open
    if (!isRecording) onToggleVoice();
  };

  const handleClose = () => {
    setOpen(false);
    if (isRecording) onToggleVoice(); // stop recording if open
    setOrderNotes("");
  };

  if (!open) {
    return (
      <div style={{ padding:"6px 16px", background:"#1F0D00", borderTop:"1px solid #3D1F00", flexShrink:0 }}>
        <button onClick={handleOpen}
          style={{ width:"100%", padding:"7px", background:"transparent", border:"1px dashed #3D1F00", borderRadius:8, color:"#7A5C40", fontSize:"0.78rem", cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", gap:6 }}>
          🎙️ Add Notes / Special Instructions
        </button>
      </div>
    );
  }

  return (
    <div style={{ padding:"10px 16px", background:"#1F0D00", borderTop:"1px solid #3D1F00", flexShrink:0 }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
        <div style={{ display:"flex", alignItems:"center", gap:8 }}>
          <label style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600 }}>Order Notes</label>
          {isRecording && (
            <span className="pulse-anim" style={{ fontSize:"0.7rem", color:"#E8251A", fontWeight:600 }}>🔴 Recording...</span>
          )}
        </div>
        <div style={{ display:"flex", gap:6 }}>
          {isRecording ? (
            <button onClick={onToggleVoice}
              style={{ display:"flex", alignItems:"center", gap:4, background:"#E8251A", border:"none", color:"white", borderRadius:20, padding:"4px 10px", fontSize:"0.72rem", cursor:"pointer" }}>
              ⏹ Stop
            </button>
          ) : (
            <button onClick={onToggleVoice}
              style={{ display:"flex", alignItems:"center", gap:4, background:"#2A1200", border:"1px solid #5A3A1A", color:"#B89070", borderRadius:20, padding:"4px 10px", fontSize:"0.72rem", cursor:"pointer" }}>
              🎙️ Re-record
            </button>
          )}
          <button onClick={handleClose}
            style={{ background:"none", border:"none", color:"#7A5C40", cursor:"pointer", fontSize:"0.8rem", padding:"0 4px" }}>✕</button>
        </div>
      </div>
      <textarea
        value={orderNotes}
        onChange={e => setOrderNotes(e.target.value)}
        placeholder="Speak or type special instructions..."
        autoFocus
        style={{ width:"100%", background:"#2A1200", border:"1px solid #5A3A1A", borderRadius:7, color:"white", fontFamily:"'DM Sans',sans-serif", fontSize:"0.82rem", padding:"7px 9px", resize:"none", height:60, outline:"none", boxSizing:"border-box" }}
      />
    </div>
  );
}

// ─────────────────────────────────────────────
// ADDRESS PICKER
// Shows known addresses as quick-select buttons
// Plus a manual input field for new addresses
// ─────────────────────────────────────────────
function AddressPicker({ label, value, onChange, addresses }) {
  const [showManual, setShowManual] = useState(false);
  const knownAddresses = [...new Set(addresses.filter(a => a && a.trim()))];

  return (
    <div>
      <div style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600, marginBottom:5 }}>{label}</div>

      {/* Known addresses as quick-select pills */}
      {knownAddresses.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:4, marginBottom:6 }}>
          {knownAddresses.map((addr, i) => (
            <button key={i} onClick={() => { onChange(addr); setShowManual(false); }}
              style={{ textAlign:"left", padding:"8px 10px", borderRadius:8, border:`1.5px solid ${value === addr ? "#F97316" : "#3D1F00"}`, background: value === addr ? "#4A1E00" : "#2A1200", color: value === addr ? "white" : "#B89070", fontSize:"0.8rem", cursor:"pointer", display:"flex", alignItems:"center", gap:8, transition:"all 0.15s" }}>
              <span style={{ fontSize:"0.75rem" }}>{value === addr ? "📍" : "🏠"}</span>
              <span style={{ flex:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{addr}</span>
              {value === addr && <span style={{ fontSize:"0.65rem", color:"#F97316", fontWeight:700, flexShrink:0 }}>✓ Selected</span>}
            </button>
          ))}
          <button onClick={() => { setShowManual(true); onChange(""); }}
            style={{ textAlign:"left", padding:"8px 10px", borderRadius:8, border:"1.5px dashed #3D1F00", background:"transparent", color:"#7A5C40", fontSize:"0.78rem", cursor:"pointer", display:"flex", alignItems:"center", gap:6 }}>
            <span>➕</span> Different address...
          </button>
        </div>
      )}

      {/* Manual input — always shown if no known addresses, or when "Different address" clicked */}
      {(knownAddresses.length === 0 || showManual || (!knownAddresses.includes(value) && value)) && (
        <input
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder="Enter street address..."
          autoFocus={showManual}
          style={{ width:"100%", padding:"9px 10px", background:"#2A1200", border:"1px solid #3D1F00", borderRadius:8, color:"white", fontSize:"0.85rem", outline:"none", boxSizing:"border-box" }}
        />
      )}
    </div>
  );
}

function SizeBtn({ label, price, selected, onClick }) {
  return (
    <div onClick={onClick} style={{ padding:"10px 8px", border:`2px solid ${selected ? "#E8251A" : "#E8D5C0"}`, borderRadius:10, background: selected ? "#FFF0EF" : "white", cursor:"pointer", textAlign:"center", transition:"all 0.2s", minHeight:52 }}>
      <div style={{ fontWeight:600, fontSize:"0.85rem", color:"#1A0A00" }}>{label}</div>
      <div style={{ fontSize:"0.75rem", color:"#7A5C40" }}>${price.toFixed(2)}</div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CUSTOMER BADGE (shows when phone found)
// ─────────────────────────────────────────────
function CustomerBadge({ customer }) {
  if (!customer) return null;
  return (
    <div className="slide-in" style={{ background:"#F0FDF4", border:"1.5px solid #16A34A", borderRadius:10, padding:"8px 12px", marginBottom:8, display:"flex", alignItems:"center", gap:10 }}>
      <span style={{ fontSize:"1.4rem" }}>🎉</span>
      <div style={{ flex:1 }}>
        <div style={{ fontWeight:700, fontSize:"0.85rem", color:"#14532D" }}>Welcome back, {customer.name || "customer"}!</div>
        <div style={{ fontSize:"0.72rem", color:"#16A34A", marginTop:1 }}>
          {customer.totalOrders} order{customer.totalOrders !== 1 ? "s" : ""} · ${customer.totalSpent.toFixed(2)} total spent
          {customer.lastOrderAt && ` · Last visit: ${new Date(customer.lastOrderAt).toLocaleDateString()}`}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// ORDER PANEL
// ─────────────────────────────────────────────
// ─────────────────────────────────────────────
// ITEM NOTE
// Per-product note with voice recording
// ─────────────────────────────────────────────
function ItemNote({ itemId, note, onSave }) {
  const [open, setOpen]         = useState(false);
  const [text, setText]         = useState(note);
  const [recording, setRec]     = useState(false);
  const recRef                  = useRef(null);

  // Sync if parent note changes (e.g. editing from board)
  useEffect(() => { setText(note); }, [note]);

  const handleOpen = () => {
    setOpen(true);
    setText(note);
  };

  const handleClose = () => {
    setOpen(false);
    if (recording) stopRec();
  };

  const handleChange = (val) => {
    setText(val);
    onSave(val);
  };

  const startRec = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech recognition not supported in this browser."); return; }
    const rec = new SR();
    rec.continuous    = true;
    rec.interimResults = true;
    rec.lang          = "en-US";
    const base = text;
    rec.onresult = (e) => {
      const transcript = Array.from(e.results).map(r => r[0].transcript).join("");
      const newText = (base ? base + " " : "") + transcript;
      setText(newText);
      onSave(newText);
    };
    rec.onerror = () => setRec(false);
    rec.onend   = () => setRec(false);
    rec.start();
    recRef.current = rec;
    setRec(true);
  };

  const stopRec = () => {
    recRef.current?.stop();
    setRec(false);
  };

  if (!open) {
    return (
      <div style={{ marginTop: note ? 5 : 3, paddingLeft:2 }}>
        {note ? (
          <div onClick={handleOpen} style={{ display:"flex", alignItems:"center", gap:5, cursor:"pointer" }}>
            <span style={{ fontSize:"0.65rem", color:"#D97706" }}>📝</span>
            <span style={{ fontSize:"0.68rem", color:"#D97706", fontStyle:"italic", flex:1, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{note}</span>
            <span style={{ fontSize:"0.6rem", color:"#5A3A1A" }}>edit</span>
          </div>
        ) : (
          <button onClick={handleOpen}
            style={{ background:"transparent", border:"none", color:"#5A3A1A", fontSize:"0.68rem", cursor:"pointer", padding:"2px 0", display:"flex", alignItems:"center", gap:4 }}>
            🎙️ <span style={{ textDecoration:"underline" }}>Add note</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div style={{ marginTop:7, background:"#1F0D00", borderRadius:8, padding:"8px 10px", border:"1px solid #3D1F00" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5 }}>
        <div style={{ display:"flex", alignItems:"center", gap:6 }}>
          <span style={{ fontSize:"0.62rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600 }}>Item Note</span>
          {recording && <span className="pulse-anim" style={{ fontSize:"0.62rem", color:"#E8251A", fontWeight:700 }}>🔴 Recording...</span>}
        </div>
        <div style={{ display:"flex", gap:5, alignItems:"center" }}>
          {recording ? (
            <button onClick={stopRec}
              style={{ background:"#E8251A", border:"none", borderRadius:12, color:"white", fontSize:"0.65rem", padding:"3px 8px", cursor:"pointer", fontWeight:600 }}>
              ⏹ Stop
            </button>
          ) : (
            <button onClick={startRec}
              style={{ background:"#2A1200", border:"1px solid #5A3A1A", borderRadius:12, color:"#B89070", fontSize:"0.65rem", padding:"3px 8px", cursor:"pointer" }}>
              🎙️ Record
            </button>
          )}
          <button onClick={handleClose}
            style={{ background:"none", border:"none", color:"#5A3A1A", cursor:"pointer", fontSize:"0.8rem", lineHeight:1, padding:"0 2px" }}>✕</button>
        </div>
      </div>
      <textarea
        value={text}
        onChange={e => handleChange(e.target.value)}
        placeholder="e.g. no onions, well done, extra sauce..."
        autoFocus
        rows={2}
        style={{ width:"100%", background:"#2A1200", border:"1px solid #3D1F00", borderRadius:6, color:"white", fontFamily:"'DM Sans',sans-serif", fontSize:"0.78rem", padding:"6px 8px", resize:"none", outline:"none", boxSizing:"border-box" }}
      />
    </div>
  );
}

function OrderPanel({ order, setOrder, fulfillment, setFulfillment, customerName, setCustomerName, customerPhone, onPhoneChange, customerAddress, setCustomerAddress, foundCustomer, lookingUp, itemCount, subtotal, tax, total, onCheckout, onClear, isMobile, hideHeader, isEditing }) {
  return (
    <div style={{ background:"#1A0A00", color:"white", display:"flex", flexDirection:"column", overflow:"hidden", borderLeft: isMobile ? "none" : "3px solid #E8251A", height: isMobile ? "auto" : "100%" }}>
      {!hideHeader && (
        <div style={{ padding:"14px 18px", background:"#3D1F00", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
          <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", letterSpacing:2 }}>Current Order</h2>
          <span style={{ background:"#E8251A", color:"white", borderRadius:12, padding:"2px 10px", fontSize:"0.82rem", fontWeight:600 }}>{itemCount} item{itemCount !== 1 ? "s" : ""}</span>
        </div>
      )}
      <div style={{ padding:"10px 16px", background:"#2A1200", display:"flex", gap:8, flexShrink:0 }}>
        {["pickup","delivery"].map(f => (
          <button key={f} onClick={() => setFulfillment(f)} style={{ flex:1, padding:"10px", borderRadius:10, border:"none", fontSize:"0.88rem", fontWeight:600, cursor:"pointer", transition:"all 0.2s", background: fulfillment === f ? "#E8251A" : "#3D1F00", color: fulfillment === f ? "white" : "#B89070" }}>
            {f === "pickup" ? "🏃 Pickup" : "🛵 Delivery"}
          </button>
        ))}
      </div>
      <div style={{ padding:"10px 16px", background:"#1F0D00", borderBottom:"1px solid #3D1F00", flexShrink:0 }}>
        <h4 style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", marginBottom:8, fontWeight:600 }}>Customer Info</h4>

        {/* Customer badge when phone matched */}
        <CustomerBadge customer={foundCustomer} />

        {fulfillment === "pickup" ? (
          <>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:7, marginBottom:7 }}>
              <Field label="Client Name" value={customerName} onChange={setCustomerName} placeholder="John Doe" />
              <PhoneField label="Phone" value={customerPhone} onChange={onPhoneChange} lookingUp={lookingUp} />
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom:7 }}>
              <PhoneField label="Phone Number" value={customerPhone} onChange={onPhoneChange} lookingUp={lookingUp} />
            </div>
            <div style={{ marginBottom:7 }}>
              <Field label="Client Name" value={customerName} onChange={setCustomerName} placeholder="John Doe" />
            </div>
            <div style={{ marginBottom:7 }}>
              <AddressPicker
                label="Delivery Address"
                value={customerAddress}
                onChange={setCustomerAddress}
                addresses={foundCustomer ? (foundCustomer.addresses || (foundCustomer.defaultAddress ? [foundCustomer.defaultAddress] : [])) : []}
              />
            </div>
          </>
        )}
      </div>
      <div style={{ flex: isMobile ? "none" : 1, overflowY: isMobile ? "visible" : "auto", padding:"10px 16px" }}>
        {order.length === 0 ? (
          <div style={{ textAlign:"center", padding:"24px 16px", color:"#5A3A1A" }}>
            <div style={{ fontSize:"2.4rem", marginBottom:8 }}>🍕</div>
            <p style={{ fontSize:"0.85rem" }}>No items yet. Tap a product!</p>
          </div>
        ) : order.map(item => {
          const ingList  = getIngredientList(item.product.category);
          const detail   = ingList.length > 0 ? (item.toppings.map(tid => ingList.find(t => t.id === tid)?.label||"").filter(Boolean).join(", ") || (item.product.category === "pizza" ? "Plain" : "")) : (item.product.note || "");
          const sizePart = item.size ? item.size.label + " " : "";
          return (
            <div key={item.id} className="slide-in" style={{ background:"#2A1200", borderRadius:10, padding:"9px 10px", marginBottom:6 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:8 }}>
                <span style={{ fontSize:"1.3rem", flexShrink:0 }}>{item.product.emoji}</span>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600, fontSize:"0.86rem" }}>{item.qty > 1 ? `${item.qty}x ` : ""}{sizePart}{item.product.name}</div>
                  {detail && <div style={{ fontSize:"0.68rem", color:"#B89070", marginTop:2, lineHeight:1.3 }}>{detail}</div>}
                </div>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1rem", color:"#F97316", letterSpacing:1, whiteSpace:"nowrap" }}>${item.price.toFixed(2)}</div>
                <button onClick={() => setOrder(prev => prev.filter(i => i.id !== item.id))} style={{ background:"none", border:"none", color:"#7A5C40", cursor:"pointer", fontSize:"0.9rem", padding:0 }}>✕</button>
              </div>
              <ItemNote itemId={item.id} note={item.note||""} onSave={(note) => setOrder(prev => prev.map(i => i.id === item.id ? {...i, note} : i))} />
            </div>
          );
        })}
      </div>
      <div style={{ padding:"12px 16px", background:"#2A1200", borderTop:"2px solid #3D1F00", flexShrink:0 }}>
        {[["Subtotal", `$${subtotal.toFixed(2)}`], ["Tax (8%)", `$${tax.toFixed(2)}`]].map(([k,v]) => (
          <div key={k} style={{ display:"flex", justifyContent:"space-between", fontSize:"0.82rem", color:"#B89070", marginBottom:4 }}><span>{k}</span><span>{v}</span></div>
        ))}
        <div style={{ display:"flex", justifyContent:"space-between", fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", color:"white", letterSpacing:1, marginTop:6, paddingTop:6, borderTop:"1px solid #5A3A1A" }}>
          <span>TOTAL</span><span>${total.toFixed(2)}</span>
        </div>
        <button onClick={onCheckout} disabled={order.length === 0} style={{ width:"100%", padding:13, background: order.length === 0 ? "#5A3A1A" : "#E8251A", color:"white", border:"none", borderRadius:11, fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", letterSpacing:2, cursor: order.length === 0 ? "not-allowed" : "pointer", marginTop:10 }}>{isEditing ? "SAVE CHANGES" : "PLACE ORDER"}</button>
        <button onClick={onClear} style={{ width:"100%", padding:7, background:"transparent", color:"#7A5C40", border:"1px solid #3D1F00", borderRadius:9, fontSize:"0.78rem", cursor:"pointer", marginTop:5 }}>Clear Order</button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PHONE FIELD with lookup spinner
// ─────────────────────────────────────────────
function PhoneField({ label, value, onChange, lookingUp }) {
  return (
    <div>
      <label style={{ display:"block", fontSize:"0.68rem", color:"#B89070", marginBottom:3, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</label>
      <div style={{ position:"relative" }}>
        <input type="tel" value={value} onChange={e => onChange(e.target.value)} placeholder="(555) 000-0000"
          style={{ width:"100%", padding:"8px 32px 8px 10px", background:"#2A1200", border:"1px solid #5A3A1A", borderRadius:7, color:"white", fontFamily:"'DM Sans',sans-serif", fontSize:"0.85rem", outline:"none" }} />
        {lookingUp && (
          <div style={{ position:"absolute", right:8, top:"50%", transform:"translateY(-50%)", width:14, height:14, border:"2px solid #5A3A1A", borderTopColor:"#F97316", borderRadius:"50%", animation:"spin 0.8s linear infinite" }} />
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FIELD
// ─────────────────────────────────────────────
function Field({ label, value, onChange, placeholder, type="text" }) {
  return (
    <div>
      <label style={{ display:"block", fontSize:"0.68rem", color:"#B89070", marginBottom:3, textTransform:"uppercase", letterSpacing:0.5 }}>{label}</label>
      <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        style={{ width:"100%", padding:"8px 10px", background:"#2A1200", border:"1px solid #5A3A1A", borderRadius:7, color:"white", fontFamily:"'DM Sans',sans-serif", fontSize:"0.85rem", outline:"none" }} />
    </div>
  );
}

// ─────────────────────────────────────────────
// TABLET ORDER BAR
// ─────────────────────────────────────────────
function TabletOrderBar(props) {
  const [expanded, setExpanded] = useState(false);
  const { itemCount, total } = props;
  return (
    <div style={{ position:"fixed", bottom:0, left:0, right:0, zIndex:30, background:"#1A0A00", borderTop:"2px solid #E8251A", boxShadow:"0 -4px 20px rgba(0,0,0,0.3)" }}>
      <div onClick={() => setExpanded(e => !e)} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 20px", cursor:"pointer" }}>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", color:"white", letterSpacing:2 }}>🛒 CURRENT ORDER</span>
          {itemCount > 0 && <span style={{ background:"#E8251A", color:"white", borderRadius:12, padding:"2px 10px", fontSize:"0.82rem", fontWeight:700 }}>{itemCount} items</span>}
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:12 }}>
          {itemCount > 0 && <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", color:"#F97316" }}>${total.toFixed(2)}</span>}
          <span style={{ color:"#B89070", fontSize:"1rem" }}>{expanded ? "▼" : "▲"}</span>
        </div>
      </div>
      {expanded && (
        <div style={{ maxHeight:"60vh", overflowY:"auto", borderTop:"1px solid #3D1F00" }}>
          <OrderPanel {...props} isMobile={false} hideHeader />
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BOARD PAGE
// ─────────────────────────────────────────────
function BoardPage({ placedOrders, boardFilter, setBoardFilter, setStatus, onDismiss, onEdit, isMobile, loading }) {
  const COLS = [
    { key:"new",  label:"📋 NEW",       colors:{ border:"#64748B", bg:"#F8FAFC", titleColor:"#475569", cntBg:"#E2E8F0", cntColor:"#475569" } },
    { key:"prep", label:"🔥 PREPARING", colors:{ border:"#D97706", bg:"#FFFBEB", titleColor:"#92400E", cntBg:"#FEF3C7", cntColor:"#92400E" } },
    { key:"done", label:"✅ READY",      colors:{ border:"#16A34A", bg:"#F0FDF4", titleColor:"#14532D", cntBg:"#DCFCE7", cntColor:"#14532D" } },
    { key:"sent", label:"✓ DONE",       colors:{ border:"#2563EB", bg:"#EFF6FF", titleColor:"#1E3A8A", cntBg:"#DBEAFE", cntColor:"#1E3A8A" } },
  ];
  const filtered = boardFilter === "all" ? placedOrders : placedOrders.filter(o => o.fulfillment === boardFilter);
  const byStatus = { new:[], prep:[], done:[], sent:[] };
  filtered.forEach(o => { if (byStatus[o.status]) byStatus[o.status].push(o); });

  return (
    <div style={{ flex:1, display:"flex", flexDirection:"column", overflow:"hidden" }}>
      <div style={{ padding: isMobile ? "10px 14px" : "14px 22px", background:"white", borderBottom:"2px solid #E8D5C0", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, flexWrap:"wrap", gap:8 }}>
        <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize: isMobile ? "1.1rem" : "1.4rem", letterSpacing:2, color:"#1A0A00" }}>📜 Orders Board</h2>
        <div style={{ display:"flex", gap:6 }}>
          {["all","pickup","delivery"].map(f => (
            <button key={f} onClick={() => setBoardFilter(f)} style={{ padding: isMobile ? "4px 10px" : "5px 13px", borderRadius:20, border:`1.5px solid ${boardFilter === f ? "#1A0A00" : "#E8D5C0"}`, background: boardFilter === f ? "#1A0A00" : "white", color: boardFilter === f ? "white" : "#7A5C40", fontSize:"0.75rem", fontWeight:600, cursor:"pointer" }}>
              {f === "all" ? "All" : f === "pickup" ? (isMobile ? "🏃" : "🏃 Pickup") : (isMobile ? "🛵" : "🛵 Delivery")}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", flex:1, gap:14 }}>
          <div className="spinner" />
          <p style={{ color:"#7A5C40", fontSize:"0.9rem" }}>Loading orders from database...</p>
        </div>
      ) : (
        <div style={{ flex:1, overflow: isMobile ? "auto" : "hidden", display: isMobile ? "block" : "grid", gridTemplateColumns: isMobile ? undefined : "1fr 1fr 1fr 1fr" }}>
          {isMobile ? (
            <div style={{ padding:"10px 12px", display:"flex", flexDirection:"column", gap:16 }}>
              {COLS.map(col => {
                const items = byStatus[col.key];
                if (!items.length) return null;
                return (
                  <div key={col.key}>
                    <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:8, paddingBottom:6, borderBottom:`2px solid ${col.colors.border}` }}>
                      <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.95rem", letterSpacing:1.5, color:col.colors.titleColor }}>{col.label}</span>
                      <span style={{ background:col.colors.cntBg, color:col.colors.cntColor, borderRadius:10, padding:"1px 7px", fontSize:"0.7rem", fontWeight:700 }}>{items.length}</span>
                    </div>
                    {items.map(o => <BoardCard key={o.id} order={o} onSetStatus={setStatus} onDismiss={onDismiss} onEdit={onEdit} isMobile />)}
                  </div>
                );
              })}
              {placedOrders.length === 0 && <div style={{ textAlign:"center", padding:"50px 20px", color:"#CBD5E1" }}>No orders yet</div>}
            </div>
          ) : (
            COLS.map(col => {
              const cc = col.colors;
              const items = byStatus[col.key];
              return (
                <div key={col.key} style={{ display:"flex", flexDirection:"column", borderRight:"1px solid #E8D5C0", overflow:"hidden" }}>
                  <div style={{ padding:"12px 14px", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0, borderBottom:`3px solid ${cc.border}`, background:cc.bg }}>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1rem", letterSpacing:1.5, color:cc.titleColor }}>{col.label}</span>
                    <span style={{ background:cc.cntBg, color:cc.cntColor, borderRadius:10, padding:"1px 7px", fontSize:"0.7rem", fontWeight:700 }}>{items.length}</span>
                  </div>
                  <div style={{ flex:1, overflowY:"auto", padding:10 }}>
                    {items.length === 0
                      ? <div style={{ textAlign:"center", padding:"28px 8px", color:"#CBD5E1", fontSize:"0.82rem" }}>No orders here</div>
                      : items.map(o => <BoardCard key={o.id} order={o} onSetStatus={setStatus} onDismiss={onDismiss} onEdit={onEdit} />)
                    }
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// BOARD CARD
// ─────────────────────────────────────────────
function BoardCard({ order:o, onSetStatus, onDismiss, onEdit }) {
  const isDelivery = o.fulfillment === "delivery";
  const canDismiss = o.status === "done" || o.status === "sent";
  const canEdit    = o.status !== "sent"; // editable until completed/sent
  let actionBtn = null;
  if (o.status === "new")        actionBtn = <StatusBtn label="🔥 Start Preparing" bg="#FEF3C7" color="#92400E" hoverBg="#FDE68A" onClick={() => onSetStatus(o.id,"prep")} />;
  else if (o.status === "prep")  actionBtn = isDelivery
    ? <StatusBtn label="🛵 Send to Delivery" bg="#DBEAFE" color="#1E3A8A" hoverBg="#BFDBFE" onClick={() => onSetStatus(o.id,"sent")} />
    : <StatusBtn label="✅ Ready for Pickup" bg="#DCFCE7" color="#14532D" hoverBg="#BBF7D0" onClick={() => onSetStatus(o.id,"done")} />;
  else if (o.status === "done")  actionBtn = <StatusBtn label="💳 Collect & Pick Up" bg="#DBEAFE" color="#1E3A8A" hoverBg="#BFDBFE" onClick={() => onSetStatus(o.id,"sent")} />;

  return (
    <div className="card-in" style={{ background:"white", borderRadius:13, padding:12, marginBottom:9, boxShadow:"0 2px 8px rgba(0,0,0,0.07)", border:"1.5px solid #E8D5C0", position:"relative" }}>
      {canDismiss && <button onClick={() => onDismiss(o.id)} style={{ position:"absolute", top:8, right:8, background:"#FEE2E2", border:"none", borderRadius:6, width:22, height:22, cursor:"pointer", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"0.72rem", color:"#991B1B" }}>✕</button>}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:5, paddingRight: canDismiss ? 28 : 0 }}>
        <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1rem", letterSpacing:1, color:"#1A0A00" }}>Order {o.num}</span>
        <span style={{ fontSize:"0.68rem", fontWeight:700, padding:"2px 7px", borderRadius:7, background: isDelivery ? "#DBEAFE" : "#FEF3C7", color: isDelivery ? "#1E3A8A" : "#92400E" }}>
          {isDelivery ? "🛵 Delivery" : "🏃 Pickup"}
        </span>
      </div>
      <div style={{ fontSize:"0.68rem", color:"#7A5C40", marginBottom:5 }}>🕐 {o.timeStr}</div>
      {o.name && <div style={{ fontSize:"0.78rem", fontWeight:600, color:"#1A0A00", marginBottom:3 }}>👤 {o.name}{o.phone ? ` · ${o.phone}` : ""}</div>}
      {o.phone && !o.name && <div style={{ fontSize:"0.78rem", fontWeight:600, color:"#1A0A00", marginBottom:3 }}>📞 {o.phone}</div>}
      {o.address && <div style={{ fontSize:"0.7rem", color:"#7A5C40", marginBottom:6 }}>📍 {o.address}</div>}
      <div style={{ marginBottom:7 }}>
        {o.items.map((item,i) => {
          const ingList  = getIngredientList(item.product.category);
          const detail   = ingList.length > 0 ? item.toppings.map(tid => ingList.find(t => t.id === tid)?.label||"").filter(Boolean).join(", ") : (item.product.note || "");
          const sizePart = item.size ? item.size.label + " " : "";
          return (
            <div key={i} style={{ fontSize:"0.74rem", color:"#3D1F00", padding:"2px 0", lineHeight:1.3 }}>
              <div style={{ display:"flex", alignItems:"flex-start", gap:4 }}>
                <span style={{ flexShrink:0 }}>{item.product.emoji} {item.qty > 1 ? `${item.qty}x ` : ""}{sizePart}{item.product.name}</span>
                {detail && <span style={{ marginLeft:"auto", color:"#7A5C40", fontSize:"0.66rem", textAlign:"right", maxWidth:"50%" }}>{detail}</span>}
              </div>
              {item.note && <div style={{ color:"#D97706", fontSize:"0.66rem", fontStyle:"italic", marginTop:1, paddingLeft:4, borderLeft:"2px solid #D97706" }}>📝 {item.note}</div>}
            </div>
          );
        })}
      </div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.98rem", color:"#E8251A", letterSpacing:1, marginBottom:7 }}>${o.total.toFixed(2)}</div>
      {o.notes && <div style={{ background:"#FFFBEB", borderRadius:7, padding:"5px 7px", fontSize:"0.7rem", color:"#78350F", marginBottom:7, borderLeft:"3px solid #D97706" }}>📝 {o.notes}</div>}
      <div style={{ display:"flex", gap:5, flexWrap:"wrap" }}>
        {actionBtn}
        {canEdit && <StatusBtn label="✏️ Edit Order" bg="#F3F4F6" color="#374151" hoverBg="#E5E7EB" onClick={() => onEdit && onEdit(o)} />}
      </div>
    </div>
  );
}

function StatusBtn({ label, bg, color, hoverBg, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}
      style={{ flex:1, padding:"7px 6px", border:"none", borderRadius:7, fontSize:"0.72rem", fontWeight:700, cursor:"pointer", background: h ? hoverBg : bg, color, whiteSpace:"nowrap", transition:"background 0.15s" }}>
      {label}
    </button>
  );
}

// ─────────────────────────────────────────────
// MANAGER PAGE
// ─────────────────────────────────────────────
function ManagerPage({ products, categories, onCategoriesChange, onAdd, onDelete, pricing, onPricingChange, onPricingBatch, isMobile, isTablet }) {
  const [mgrFilter, setMgrFilter] = useState("all");
  const [showForm, setShowForm]   = useState(!isMobile);
  const catFilters = [{ key:"all", label:"All" }, ...(categories||[]).map(c => ({ key:c.key, label:c.label+"s", icon:c.emoji }))];
  const [cat,   setCat]   = useState("pizza");
  const [name,  setName]  = useState("");
  const [price, setPrice] = useState("");
  const [emoji, setEmoji] = useState("");
  const [note,  setNote]  = useState("");
  const [mgrToppings, setMgrToppings] = useState([]);
  const [saving, setSaving]   = useState(false);
  const [saved,  setSaved]    = useState(false);

  const toggleMgrTopping = (id) => setMgrToppings(prev => prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]);

  // New category inline form
  const [showNewCat,    setShowNewCat]    = useState(false);
  const [newCatName,    setNewCatName]    = useState("");
  const [newCatEmoji,   setNewCatEmoji]   = useState("");
  const [newCatSaving,  setNewCatSaving]  = useState(false);

  const handleAddCategory = async () => {
    const label = newCatName.trim();
    if (!label) { alert("Please enter a category name."); return; }
    const key = label.toLowerCase().replace(/[^a-z0-9]/g, "_");
    if (categories.find(c => c.key === key)) { alert("Category already exists."); return; }
    const emoji = newCatEmoji.trim() || "🍽️";
    setNewCatSaving(true);
    const result = await addCategory({ key, label, emoji, sortOrder: categories.length + 1 });
    setNewCatSaving(false);
    if (!result.success) { alert("Error saving category: " + result.error); return; }
    const updated = await getCategories();
    onCategoriesChange(updated);
    setCat(key);
    setNewCatName(""); setNewCatEmoji(""); setShowNewCat(false);
  };

  const handleSave = async () => {
    if (!name.trim()) { alert("Please enter a product name."); return; }
    const p = parseFloat(price);
    if (isNaN(p) || p <= 0) { alert("Please enter a valid price."); return; }
    const defEmoji = categories.find(c => c.key === cat)?.emoji || "🍽️";
    setSaving(true);
    const ok = await onAdd({ category:cat, name:name.trim(), emoji:emoji.trim()||defEmoji, price:p, defaultToppings: ["pizza","salad","grinder"].includes(cat) ? [...mgrToppings] : [], note:note.trim() });
    setSaving(false);
    if (ok) {
      setName(""); setPrice(""); setEmoji(""); setNote(""); setMgrToppings([]);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
      if (isMobile) setShowForm(false);
    }
  };

  const BUILTIN_CATS = ["pizza","salad","grinder","side","soda"];

  const handleRemoveCategory = async (catKey) => {
    const usedCount = products.filter(p => p.category === catKey).length;
    if (usedCount > 0) {
      alert(`Cannot remove — ${usedCount} product${usedCount !== 1 ? "s" : ""} still use this category. Remove them first.`);
      return;
    }
    if (!window.confirm(`Remove this category? This cannot be undone.`)) return;
    const result = await deleteCategory(catKey);
    if (!result.success) { alert("Error: " + result.error); return; }
    const updated = await getCategories();
    onCategoriesChange(updated);
    if (cat === catKey) setCat("pizza");
  };

  const filteredProducts = mgrFilter === "all" ? products : products.filter(p => p.category === mgrFilter);
  const sidebarWidth = isMobile ? "100%" : isTablet ? "340px" : "380px";

  const formContent = (
    <div style={{ background:"#1A0A00", color:"white", padding:isMobile ? 16 : 20, overflowY:"auto", flexShrink:0, width: isMobile ? "100%" : sidebarWidth, maxHeight: isMobile ? "none" : "100%", borderRight: isMobile ? "none" : "3px solid #E8251A", borderBottom: isMobile ? "2px solid #E8251A" : "none", flex: isMobile ? "1" : "none", minHeight:0 }}>
      <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:2, marginBottom:14, color:"white" }}>➕ Add Product</h3>
<MgrField label="Category">
  <select
    value={cat}
    onChange={e => {
      if (e.target.value === "__new__") { setShowNewCat(true); }
      else { setCat(e.target.value); setShowNewCat(false); }
    }}
    style={{ ...darkInput, cursor:"pointer" }}>
    {categories.map(c => (
      <option key={c.key} value={c.key}>{c.emoji} {c.label}</option>
    ))}
    <option value="__new__">➕ Add new category...</option>
  </select>
</MgrField>
      {showNewCat && (
        <div style={{ background:"#2A1200", borderRadius:10, padding:"12px 14px", border:"1px dashed #F97316", marginBottom:10 }}>
          <div style={{ fontSize:"0.7rem", color:"#F97316", fontWeight:600, textTransform:"uppercase", letterSpacing:1, marginBottom:8 }}>New Category</div>
          <div style={{ display:"flex", gap:7, marginBottom:8 }}>
            <input value={newCatName} onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key==="Enter" && handleAddCategory()} placeholder="e.g. Pasta, Dessert..." style={{ ...darkInput, flex:1 }} />
            <input value={newCatEmoji} onChange={e => setNewCatEmoji(e.target.value)} placeholder="🍝" maxLength={2} style={{ ...darkInput, width:52, textAlign:"center", fontSize:"1.2rem" }} />
          </div>
          <div style={{ display:"flex", gap:7 }}>
            <button onClick={() => { setShowNewCat(false); setNewCatName(""); setNewCatEmoji(""); }} style={{ flex:1, padding:"8px", background:"#3D1F00", border:"none", borderRadius:8, color:"#B89070", fontWeight:600, fontSize:"0.8rem", cursor:"pointer" }}>Cancel</button>
            <button onClick={handleAddCategory} disabled={newCatSaving} style={{ flex:2, padding:"8px", background: newCatSaving ? "#5A3A1A" : "#F97316", border:"none", borderRadius:8, color:"white", fontWeight:700, fontSize:"0.8rem", cursor: newCatSaving ? "not-allowed" : "pointer" }}>{newCatSaving ? "Saving..." : "✓ Add Category"}</button>
          </div>
        </div>
      )}
      <MgrField label="Product Name">
        <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Caesar Salad" style={darkInput} />
      </MgrField>
      <div style={{ display:"flex", gap:8 }}>
        <MgrField label="Price ($)" style={{ flex:1 }}>
          <input type="number" value={price} onChange={e => setPrice(e.target.value)} placeholder="9.99" step="0.01" min="0" style={darkInput} />
        </MgrField>
        <MgrField label="Emoji" style={{ flex:1 }}>
          <input value={emoji} onChange={e => setEmoji(e.target.value)} placeholder="🍕" maxLength={2} style={darkInput} />
        </MgrField>
      </div>
      <MgrField label="Note (visible on menu)">
        <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Gluten-free available..." style={{ ...darkInput, resize:"none", height:60 }} />
      </MgrField>
      {["pizza","salad","grinder"].includes(cat) && (
        <MgrIngredientPicker
          cat={cat}
          selected={mgrToppings}
          onToggle={toggleMgrTopping}
          isMobile={isMobile}
        />
      )}
      <button onClick={handleSave} disabled={saving} style={{ width:"100%", padding:12, background: saved ? "#16A34A" : saving ? "#5A3A1A" : "#F97316", color:"white", border:"none", borderRadius:10, fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:2, cursor: saving ? "not-allowed" : "pointer", marginTop:12, transition:"background 0.3s" }}>
        {saving ? "Saving..." : saved ? "✓ Product Added!" : "➕ Add Product"}
      </button>
      <PricingManager pricing={pricing} onPricingChange={onPricingChange} onPricingBatch={onPricingBatch} />
      <StaffManager />
    </div>
  );

  return (
    <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection: isMobile ? "column" : "row", height:"100%" }}>
      {isMobile ? (
        <>
          <div style={{ padding:"10px 14px", background:"white", borderBottom:"1px solid #E8D5C0", display:"flex", alignItems:"center", justifyContent:"space-between", flexShrink:0 }}>
            <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:2, color:"#3D1F00" }}>⚙️ Manager</span>
            <button onClick={() => setShowForm(f => !f)} style={{ padding:"6px 14px", background:"#E8251A", color:"white", border:"none", borderRadius:20, fontSize:"0.8rem", fontWeight:600, cursor:"pointer" }}>
              {showForm ? "📦 Products" : "➕ Add Product"}
            </button>
          </div>
          {showForm ? (
            <div style={{ flex:1, overflowY:"auto", minHeight:0 }}>{formContent}</div>
          ) : (
            <div style={{ flex:1, overflowY:"auto", padding:"12px 14px" }}>
              <ProductGrid products={filteredProducts} mgrFilter={mgrFilter} setMgrFilter={setMgrFilter} onDelete={onDelete} catFilters={catFilters} isMobile />
            </div>
          )}
        </>
      ) : (
        <>
          {formContent}
          <div style={{ flex:1, padding:20, overflowY:"auto", background:"#FFF8F0" }}>
            <ProductGrid products={filteredProducts} mgrFilter={mgrFilter} setMgrFilter={setMgrFilter} onDelete={onDelete} catFilters={catFilters} />
          </div>
        </>
      )}
    </div>
  );
}

function ProductGrid({ products, mgrFilter, setMgrFilter, onDelete, catFilters=[], isMobile }) {
  return (
    <>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
        <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:2, color:"#3D1F00" }}>📦 All Products</h3>
      </div>
      <div style={{ display:"flex", gap:6, marginBottom:12, flexWrap:"wrap" }}>
        {catFilters.map(f => (
          <button key={f.key} onClick={() => setMgrFilter(f.key)} style={{ padding:"4px 10px", borderRadius:20, border:`1.5px solid ${mgrFilter === f.key ? "#1A0A00" : "#E8D5C0"}`, background: mgrFilter === f.key ? "#1A0A00" : "white", color: mgrFilter === f.key ? "white" : "#7A5C40", fontSize:"0.75rem", fontWeight:600, cursor:"pointer" }}>
            {isMobile ? f.icon : `${f.icon} ${f.label}`}
          </button>
        ))}
      </div>
      {products.length === 0 ? (
        <div style={{ textAlign:"center", padding:"40px 20px", color:"#7A5C40" }}>No products in this category yet.</div>
      ) : (
        <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr 1fr" : "repeat(auto-fill,minmax(190px,1fr))", gap:10 }}>
          {products.map(p => {
            const isPizza = p.category === "pizza";
            const sub = isPizza ? (p.defaultToppings.length ? p.defaultToppings.map(t => ALL_TOPPINGS.find(x => x.id === t)?.label || "").join(", ") : "No default toppings") : "";
            const cc = getCategoryColor(p.category);
            return (
              <div key={p.id} style={{ background:"white", borderRadius:12, padding:12, boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1.5px solid #E8D5C0", position:"relative" }}>
                <button onClick={() => onDelete(p.id)} style={{ position:"absolute", top:7, right:7, background:"#FEE2E2", border:"none", borderRadius:6, padding:"2px 6px", fontSize:"0.68rem", color:"#991B1B", cursor:"pointer", fontWeight:600 }}>✕</button>
                <div style={{ display:"flex", alignItems:"flex-start", gap:8, marginBottom:7, paddingRight:30 }}>
                  <span style={{ fontSize:"1.8rem", flexShrink:0 }}>{p.emoji}</span>
                  <div>
                    <div style={{ fontWeight:600, fontSize:"0.88rem", color:"#1A0A00" }}>{p.name}</div>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.05rem", color:"#E8251A" }}>${p.price.toFixed(2)}</div>
                    <span style={{ ...cc, fontSize:"0.58rem", fontWeight:700, padding:"1px 5px", borderRadius:5, textTransform:"uppercase", letterSpacing:0.5, display:"inline-block", marginTop:3 }}>{CAT_LABEL[p.category]}</span>
                  </div>
                </div>
                {sub && !isMobile && <div style={{ fontSize:"0.68rem", color:"#7A5C40", lineHeight:1.3 }}>{sub}</div>}
                {p.note && <div style={{ fontSize:"0.68rem", color:"#D97706", marginTop:3, fontStyle:"italic" }}>ℹ {p.note}</div>}
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function MgrField({ label, children, style }) {
  return (
    <div style={{ marginBottom:12, ...style }}>
      <label style={{ display:"block", fontSize:"0.68rem", color:"#B89070", marginBottom:4, textTransform:"uppercase", letterSpacing:0.5, fontWeight:600 }}>{label}</label>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// OVERLAY
// ─────────────────────────────────────────────
function Overlay({ children, isMobile }) {
  return (
    <div style={{ position:"fixed", inset:0, background:"rgba(26,10,0,0.85)", zIndex:200, display:"flex", alignItems: isMobile ? "flex-end" : "center", justifyContent:"center", overflowY:"auto", WebkitOverflowScrolling:"touch", padding: isMobile ? 0 : "20px 0" }}>
      {children}
    </div>
  );
}

// ─────────────────────────────────────────────
// PAY BUTTON
// ─────────────────────────────────────────────
function PayBtn({ icon, label, sub, bg, border, textColor, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} onClick={onClick}
      style={{ flex:1, padding:"16px 10px", background: h ? border+"22" : bg, border:`2px solid ${border}`, borderRadius:14, cursor:"pointer", fontFamily:"'DM Sans',sans-serif", transition:"all 0.2s" }}>
      <div style={{ fontSize:"2rem", marginBottom:5 }}>{icon}</div>
      <div style={{ fontWeight:700, fontSize:"1rem", color:textColor }}>{label}</div>
      <div style={{ fontSize:"0.75rem", color:border, marginTop:2 }}>{sub}</div>
    </button>
  );
}

// ─────────────────────────────────────────────
// MANAGER INGREDIENT PICKER
// Reusable checkbox grid for pizza/salad/grinder
// default ingredients in the Add Product form
// ─────────────────────────────────────────────
function MgrIngredientPicker({ cat, selected, onToggle, isMobile }) {
  const isSalad      = cat === "salad";
  const allIng       = getIngredientList(cat);
  const mainList     = isSalad ? allIng.filter(i => !i.id.startsWith("d_")) : allIng;
  const dressingList = isSalad ? allIng.filter(i =>  i.id.startsWith("d_")) : [];
  const sectionLabel = cat === "pizza" ? "Default Toppings" : "Default Ingredients";

  const Chip = ({ t }) => {
    const checked = selected.includes(t.id);
    return (
      <div onClick={() => onToggle(t.id)}
        style={{ display:"flex", alignItems:"center", padding: isMobile ? "10px 12px" : "6px 8px", borderRadius:8, background: checked ? "#4A1E00" : "#2A1200", border: checked ? "1px solid #F97316" : "1px solid #3D1F00", cursor:"pointer", userSelect:"none", minHeight: isMobile ? 44 : 34, transition:"background 0.15s" }}>
        <input type="checkbox" checked={checked} readOnly
          style={{ accentColor:"#F97316", width: isMobile ? 16 : 13, height: isMobile ? 16 : 13, flexShrink:0, marginRight: isMobile ? 10 : 6, pointerEvents:"none" }} />
        <span style={{ fontSize: isMobile ? "0.88rem" : "0.72rem", color: checked ? "white" : "#D4B896", fontWeight: checked ? 600 : 400 }}>{t.label}</span>
        {checked && <span style={{ marginLeft:"auto", fontSize:"0.65rem", color:"#F97316", fontWeight:700 }}>✓</span>}
      </div>
    );
  };

  return (
    <>
      <div style={{ fontSize:"0.7rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600, margin:"10px 0 7px", paddingTop:10, borderTop:"1px solid #3D1F00" }}>
        {sectionLabel}
      </div>
      <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 5 : 4 }}>
        {mainList.map(t => <Chip key={t.id} t={t} />)}
      </div>
      {isSalad && dressingList.length > 0 && (
        <>
          <div style={{ fontSize:"0.7rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600, margin:"10px 0 7px" }}>
            Default Dressing
          </div>
          <div style={{ display:"grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr", gap: isMobile ? 5 : 4 }}>
            {dressingList.map(t => <Chip key={t.id} t={t} />)}
          </div>
        </>
      )}
    </>
  );
}

// ─────────────────────────────────────────────
// LOGIN SCREEN
// Staff tap name → into POS
// Owner taps "Manager Access" → PIN entry
// ─────────────────────────────────────────────
function LoginScreen({ onLogin }) {
  const [mode, setMode]         = useState("staff");   // "staff" | "pin"
  const [pin, setPin]           = useState("");
  const [pinError, setPinError] = useState(false);
  const [shake, setShake]       = useState(false);
  const [staffList, setStaffList] = useState([]);
  const [ownerPin,  setOwnerPin]  = useState("1234");
  const [loading,   setLoading]   = useState(true);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("pricing_config").select("id,text_value").in("id",["pos_staff","pos_pin"]);
      if (data) {
        const staffRow = data.find(r => r.id === "pos_staff");
        const pinRow   = data.find(r => r.id === "pos_pin");
        if (staffRow) try { setStaffList(JSON.parse(staffRow.text_value)); } catch(e) { setStaffList(["Ani"]); }
        else setStaffList(["Ani"]);
        if (pinRow) setOwnerPin(String(pinRow.text_value));
      } else { setStaffList(["Ani"]); }
      setLoading(false);
    };
    load();
  }, []);

  const handleStaffLogin = (name) => {
    onLogin({ name, role: "cashier", loginTime: new Date() });
  };

  const handlePinDigit = (d) => {
    const next = pin + d;
    setPin(next);
    setPinError(false);
    if (next.length === 4) {
      console.log("[PIN] entered:", next, "stored:", ownerPin, "match:", next === ownerPin);
      if (next === ownerPin) {
        onLogin({ name: "Owner", role: "owner", loginTime: new Date() });
      } else {
        setPinError(true);
        setShake(true);
        setTimeout(() => { setPin(""); setShake(false); }, 700);
      }
    }
  };

  return (
    <div style={{ minHeight:"100vh", background:"#1A0A00", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", fontFamily:"'DM Sans',sans-serif", padding:20 }}>
      {/* Logo */}
      <div style={{ textAlign:"center", marginBottom:36 }}>
        <div style={{ fontSize:"3.5rem", marginBottom:8 }}>🍕</div>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"2.4rem", color:"white", letterSpacing:3 }}>PizzaPOS</div>
        <div style={{ color:"rgba(255,255,255,0.4)", fontSize:"0.85rem", marginTop:4 }}>
          {new Date().toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric" })}
        </div>
      </div>

      {mode === "staff" ? (
        <div style={{ width:"100%", maxWidth:420 }}>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:"0.8rem", textTransform:"uppercase", letterSpacing:1.5, textAlign:"center", marginBottom:16, fontWeight:600 }}>
            Who's working today?
          </div>
          <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
            {staffList.map(name => (
              <button key={name} onClick={() => handleStaffLogin(name)}
                style={{ width:"100%", padding:"16px 20px", background:"#2A1200", border:"2px solid #3D1F00", borderRadius:14, color:"white", fontSize:"1.05rem", fontWeight:600, cursor:"pointer", display:"flex", alignItems:"center", gap:12, transition:"all 0.15s" }}
                onMouseEnter={e => { e.currentTarget.style.background="#3D1F00"; e.currentTarget.style.borderColor="#F97316"; }}
                onMouseLeave={e => { e.currentTarget.style.background="#2A1200"; e.currentTarget.style.borderColor="#3D1F00"; }}>
                <span style={{ width:40, height:40, borderRadius:"50%", background:"#E8251A", display:"flex", alignItems:"center", justifyContent:"center", fontSize:"1rem", fontWeight:700, flexShrink:0 }}>
                  {name.charAt(0).toUpperCase()}
                </span>
                {name}
                <span style={{ marginLeft:"auto", color:"rgba(255,255,255,0.3)", fontSize:"0.8rem" }}>→</span>
              </button>
            ))}
          </div>
          <button onClick={() => setMode("pin")}
            style={{ width:"100%", marginTop:20, padding:"12px", background:"transparent", border:"1px solid #3D1F00", borderRadius:12, color:"rgba(255,255,255,0.4)", fontSize:"0.82rem", cursor:"pointer" }}>
            🔐 Manager Access
          </button>
        </div>
      ) : (
        <div style={{ width:"100%", maxWidth:320, textAlign:"center" }}>
          <button onClick={() => { setMode("staff"); setPin(""); setPinError(false); }}
            style={{ background:"none", border:"none", color:"rgba(255,255,255,0.4)", cursor:"pointer", fontSize:"0.82rem", marginBottom:20 }}>
            ← Back
          </button>
          <div style={{ color:"rgba(255,255,255,0.6)", fontSize:"0.8rem", textTransform:"uppercase", letterSpacing:1.5, marginBottom:24, fontWeight:600 }}>
            Enter Manager PIN
          </div>
          {/* PIN dots */}
          <div style={{ display:"flex", justifyContent:"center", gap:14, marginBottom:28 }}
            className={shake ? "shake-anim" : ""}>
            {[0,1,2,3].map(i => (
              <div key={i} style={{ width:18, height:18, borderRadius:"50%", background: i < pin.length ? (pinError ? "#EF4444" : "#F97316") : "rgba(255,255,255,0.15)", transition:"background 0.15s" }} />
            ))}
          </div>
          {/* Numpad */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:10 }}>
            {["1","2","3","4","5","6","7","8","9","","0","⌫"].map((d,i) => (
              <button key={i} onClick={() => {
                if (d === "⌫") setPin(p => p.slice(0,-1));
                else if (d !== "") handlePinDigit(d);
              }} disabled={d === ""}
                style={{ padding:"18px 0", background: d === "" ? "transparent" : "#2A1200", border: d === "" ? "none" : "1.5px solid #3D1F00", borderRadius:12, color:"white", fontSize:"1.3rem", fontWeight:600, cursor: d === "" ? "default" : "pointer", transition:"background 0.1s" }}
                onMouseEnter={e => { if(d && d !== "") e.currentTarget.style.background="#3D1F00"; }}
                onMouseLeave={e => { if(d && d !== "") e.currentTarget.style.background="#2A1200"; }}>
                {d}
              </button>
            ))}
          </div>
          {pinError && <div style={{ color:"#EF4444", fontSize:"0.82rem", marginTop:14 }}>Incorrect PIN — try again</div>}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// DASHBOARD PAGE
// Owner-only: daily/weekly/monthly revenue,
// top products, staff performance
// ─────────────────────────────────────────────
function DashboardPage({ isMobile }) {
  const [view, setView]       = useState("daily");   // "daily" | "weekly" | "monthly"
  const [orders, setOrders]   = useState([]);
  const [loading, setLoading] = useState(true);

  // Load ALL orders from Supabase for full history
  useEffect(() => {
    const load = async () => {
      const { supabase } = await import('./lib/supabase');
      const { data, error } = await supabase.from('orders').select('*, order_items(*)').order('created_at', { ascending: true });
      if (!error && data) setOrders(data);
      setLoading(false);
    };
    load();
  }, []);

  if (loading) return (
    <div style={{ flex:1, display:"flex", alignItems:"center", justifyContent:"center", flexDirection:"column", gap:14 }}>
      <div className="spinner" />
      <p style={{ color:"#7A5C40" }}>Loading dashboard...</p>
    </div>
  );

  const now   = new Date();
  const today = now.toDateString();

  // ── Helper: parse order date ──
  const orderDate = o => new Date(o.created_at);
  const isToday   = o => orderDate(o).toDateString() === today;

  // ── Today's stats ──
  const todayOrders  = orders.filter(isToday);
  const todayRev     = todayOrders.reduce((s,o) => s + parseFloat(o.total||0), 0);
  const todayCount   = todayOrders.length;
  const todayAvg     = todayCount ? todayRev / todayCount : 0;
  const todayCard    = todayOrders.filter(o => o.payment_method === "card").reduce((s,o) => s + parseFloat(o.total||0), 0);
  const todayCash    = todayOrders.filter(o => o.payment_method === "cash").reduce((s,o) => s + parseFloat(o.total||0), 0);

  // ── Weekly chart data (last 7 days) ──
  const weekDays = Array.from({length:7}, (_,i) => {
    const d = new Date(now); d.setDate(d.getDate() - (6-i));
    return d;
  });
  const weekData = weekDays.map(d => {
    const label = d.toLocaleDateString("en-US", { weekday:"short" });
    const rev   = orders.filter(o => orderDate(o).toDateString() === d.toDateString())
                        .reduce((s,o) => s + parseFloat(o.total||0), 0);
    return { label, rev, isToday: d.toDateString() === today };
  });
  const maxWeekRev = Math.max(...weekData.map(d => d.rev), 1);

  // ── Monthly chart data (last 12 months) ──
  const monthData = Array.from({length:12}, (_,i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (11-i), 1);
    const label = d.toLocaleDateString("en-US", { month:"short" });
    const rev = orders.filter(o => {
      const od = orderDate(o);
      return od.getFullYear() === d.getFullYear() && od.getMonth() === d.getMonth();
    }).reduce((s,o) => s + parseFloat(o.total||0), 0);
    return { label, rev, isCurrent: d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear() };
  });
  const maxMonthRev = Math.max(...monthData.map(d => d.rev), 1);

  // ── Hourly chart (today) ──
  const hourData = Array.from({length:24}, (_,i) => {
    const rev = todayOrders.filter(o => orderDate(o).getHours() === i)
                           .reduce((s,o) => s + parseFloat(o.total||0), 0);
    return { label: i === 0 ? "12a" : i < 12 ? `${i}a` : i === 12 ? "12p" : `${i-12}p`, rev };
  }).filter((_,i) => i >= 6 && i <= 22); // 6am–10pm
  const maxHourRev = Math.max(...hourData.map(d => d.rev), 1);

  // ── Top products ──
  const productCounts = {};
  orders.forEach(o => (o.order_items||[]).forEach(item => {
    const key = item.product_name;
    if (!productCounts[key]) productCounts[key] = { name:key, emoji:item.product_emoji||"🍽️", count:0, rev:0 };
    productCounts[key].count += item.quantity || 1;
    productCounts[key].rev   += parseFloat(item.price||0);
  }));
  const topProducts = Object.values(productCounts).sort((a,b) => b.count - a.count).slice(0,6);

  // ── Staff performance (today) ──
  const staffStats = {};
  todayOrders.forEach(o => {
    const name = o.staff_name || "Unknown";
    if (!staffStats[name]) staffStats[name] = { name, count:0, rev:0 };
    staffStats[name].count++;
    staffStats[name].rev += parseFloat(o.total||0);
  });
  const staffList = Object.values(staffStats).sort((a,b) => b.count - a.count);

  // ── Chart data to show ──
  const chartData = view === "daily" ? hourData : view === "weekly" ? weekData : monthData;
  const maxRev    = view === "daily" ? maxHourRev : view === "weekly" ? maxWeekRev : maxMonthRev;

  const StatCard = ({ icon, label, value, sub, color="#E8251A" }) => (
    <div style={{ background:"white", borderRadius:14, padding:"16px 18px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1.5px solid #E8D5C0", flex:1, minWidth:0 }}>
      <div style={{ fontSize:"1.4rem", marginBottom:4 }}>{icon}</div>
      <div style={{ fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:1, color:"#7A5C40", fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", color, letterSpacing:1 }}>{value}</div>
      {sub && <div style={{ fontSize:"0.72rem", color:"#B89070", marginTop:2 }}>{sub}</div>}
    </div>
  );

  return (
    <div style={{ flex:1, overflowY:"auto", padding: isMobile ? "14px 12px" : "20px 24px", background:"#FFF8F0" }}>
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:18 }}>
        <h2 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.6rem", letterSpacing:2, color:"#1A0A00" }}>📊 Dashboard</h2>
        <div style={{ fontSize:"0.78rem", color:"#7A5C40" }}>
          {now.toLocaleDateString("en-US", { weekday:"long", month:"long", day:"numeric", year:"numeric" })}
        </div>
      </div>

      {/* ── TODAY'S STATS ── */}
      <div style={{ display:"flex", gap:10, marginBottom:20, flexWrap:"wrap" }}>
        <StatCard icon="💰" label="Today's Revenue" value={`$${todayRev.toFixed(2)}`} sub={`${todayCount} orders`} />
        <StatCard icon="📦" label="Orders Today" value={todayCount} sub={`Avg $${todayAvg.toFixed(2)}`} color="#1A0A00" />
        <StatCard icon="💳" label="Card" value={`$${todayCard.toFixed(2)}`} sub={todayCount ? `${Math.round(todayCard/todayRev*100)||0}% of revenue` : "—"} color="#1E3A8A" />
        <StatCard icon="💵" label="Cash" value={`$${todayCash.toFixed(2)}`} sub={todayCount ? `${Math.round(todayCash/todayRev*100)||0}% of revenue` : "—"} color="#14532D" />
      </div>

      {/* ── REVENUE CHART ── */}
      <div style={{ background:"white", borderRadius:16, padding:"18px 20px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1.5px solid #E8D5C0", marginBottom:20 }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:16 }}>
          <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:1.5, color:"#1A0A00" }}>Revenue</h3>
          <div style={{ display:"flex", gap:6 }}>
            {[["daily","Today"],["weekly","Week"],["monthly","Year"]].map(([v,l]) => (
              <button key={v} onClick={() => setView(v)}
                style={{ padding:"4px 12px", borderRadius:20, border:`1.5px solid ${view===v ? "#E8251A" : "#E8D5C0"}`, background: view===v ? "#E8251A" : "white", color: view===v ? "white" : "#7A5C40", fontSize:"0.75rem", fontWeight:600, cursor:"pointer" }}>
                {l}
              </button>
            ))}
          </div>
        </div>
        {/* Bar chart */}
        <div style={{ display:"flex", alignItems:"flex-end", gap: isMobile ? 3 : 6, height:160, paddingBottom:24, position:"relative" }}>
          {chartData.map((d,i) => {
            const pct = d.rev / maxRev;
            const isHighlight = d.isToday || d.isCurrent;
            return (
              <div key={i} style={{ flex:1, display:"flex", flexDirection:"column", alignItems:"center", gap:4, height:"100%", justifyContent:"flex-end", position:"relative" }}>
                {d.rev > 0 && (
                  <div style={{ fontSize:"0.55rem", color:"#7A5C40", fontWeight:600, position:"absolute", top: `${(1-pct)*100}%`, transform:"translateY(-110%)", whiteSpace:"nowrap" }}>
                    ${d.rev.toFixed(0)}
                  </div>
                )}
                <div style={{ width:"100%", borderRadius:"4px 4px 0 0", background: isHighlight ? "#E8251A" : "#FEE2E2", height:`${Math.max(pct*100, d.rev > 0 ? 4 : 0)}%`, minHeight: d.rev > 0 ? 4 : 0, transition:"height 0.3s" }} />
                <div style={{ position:"absolute", bottom:-20, fontSize:"0.6rem", color: isHighlight ? "#E8251A" : "#7A5C40", fontWeight: isHighlight ? 700 : 400, whiteSpace:"nowrap" }}>
                  {d.label}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div style={{ display:"flex", gap:16, flexWrap:"wrap" }}>
        {/* ── TOP PRODUCTS ── */}
        <div style={{ flex:1, minWidth: isMobile ? "100%" : 280, background:"white", borderRadius:16, padding:"16px 18px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1.5px solid #E8D5C0" }}>
          <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:1.5, color:"#1A0A00", marginBottom:14 }}>🏆 Top Products</h3>
          {topProducts.length === 0 ? (
            <div style={{ color:"#B89070", fontSize:"0.82rem", textAlign:"center", padding:"20px 0" }}>No orders yet</div>
          ) : topProducts.map((p,i) => (
            <div key={p.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom: i < topProducts.length-1 ? "1px solid #F3E8D8" : "none" }}>
              <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1rem", color:"#E8D5C0", width:20 }}>#{i+1}</span>
              <span style={{ fontSize:"1.1rem" }}>{p.emoji}</span>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.82rem", fontWeight:600, color:"#1A0A00" }}>{p.name}</div>
                <div style={{ fontSize:"0.68rem", color:"#B89070" }}>{p.count} sold</div>
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.95rem", color:"#E8251A" }}>${p.rev.toFixed(2)}</div>
            </div>
          ))}
        </div>

        {/* ── STAFF TODAY ── */}
        <div style={{ flex:1, minWidth: isMobile ? "100%" : 240, background:"white", borderRadius:16, padding:"16px 18px", boxShadow:"0 2px 8px rgba(0,0,0,0.06)", border:"1.5px solid #E8D5C0" }}>
          <h3 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", letterSpacing:1.5, color:"#1A0A00", marginBottom:14 }}>👥 Staff Today</h3>
          {staffList.length === 0 ? (
            <div style={{ color:"#B89070", fontSize:"0.82rem", textAlign:"center", padding:"20px 0" }}>No orders taken yet</div>
          ) : staffList.map((s,i) => (
            <div key={s.name} style={{ display:"flex", alignItems:"center", gap:10, padding:"8px 0", borderBottom: i < staffList.length-1 ? "1px solid #F3E8D8" : "none" }}>
              <div style={{ width:34, height:34, borderRadius:"50%", background:"#E8251A", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:"0.9rem", flexShrink:0 }}>
                {s.name.charAt(0)}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.82rem", fontWeight:600, color:"#1A0A00" }}>{s.name}</div>
                <div style={{ fontSize:"0.68rem", color:"#B89070" }}>{s.count} order{s.count !== 1 ? "s" : ""}</div>
              </div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.95rem", color:"#14532D" }}>${s.rev.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// STAFF MANAGER — used inside ManagerPage
// Owner adds/removes staff names + changes PIN
// ─────────────────────────────────────────────
function StaffManager() {
  const [staff,    setStaff]    = useState([]);
  const [pin,      setPin]      = useState("1234");
  const [newName,  setNewName]  = useState("");
  const [newPin,   setNewPin]   = useState("");
  const [pinSaved, setPinSaved] = useState(false);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabase.from("pricing_config").select("id,text_value").in("id",["pos_staff","pos_pin"]);
      if (data) {
        const staffRow = data.find(r => r.id === "pos_staff");
        const pinRow   = data.find(r => r.id === "pos_pin");
        if (staffRow) try { setStaff(JSON.parse(staffRow.text_value)); } catch(e) { setStaff(["Ani"]); }
        else setStaff(["Ani"]);
        if (pinRow) setPin(String(pinRow.text_value));
      } else { setStaff(["Ani"]); }
    };
    load();
  }, []);

  const save = async (list) => {
    setStaff(list);
    await supabase.from("pricing_config").upsert({ id:"pos_staff", text_value: JSON.stringify(list), updated_at: new Date().toISOString() });
  };

  const addStaff = () => {
    if (!newName.trim()) return;
    if (staff.includes(newName.trim())) { alert("Name already exists"); return; }
    save([...staff, newName.trim()]);
    setNewName("");
  };

  const removeStaff = (name) => {
    if (!window.confirm(`Remove ${name}?`)) return;
    save(staff.filter(s => s !== name));
  };

  const savePin = async () => {
    if (newPin.length !== 4 || !/^\d{4}$/.test(newPin)) { alert("PIN must be 4 digits"); return; }
    await supabase.from("pricing_config").upsert({ id:"pos_pin", text_value: newPin, updated_at: new Date().toISOString() });
    setPin(newPin); setNewPin(""); setPinSaved(true);
    setTimeout(() => setPinSaved(false), 2000);
  };

  const darkInput = { width:"100%", padding:"9px 10px", background:"#2A1200", border:"1px solid #3D1F00", borderRadius:8, color:"white", fontSize:"0.85rem", outline:"none", boxSizing:"border-box" };

  return (
    <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #3D1F00" }}>
      <div style={{ fontSize:"0.7rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600, marginBottom:10 }}>Staff Members</div>
      <div style={{ display:"flex", flexDirection:"column", gap:6, marginBottom:10 }}>
        {staff.map(name => (
          <div key={name} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", background:"#2A1200", borderRadius:8, padding:"8px 12px" }}>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <div style={{ width:28, height:28, borderRadius:"50%", background:"#E8251A", display:"flex", alignItems:"center", justifyContent:"center", color:"white", fontWeight:700, fontSize:"0.8rem" }}>{name.charAt(0)}</div>
              <span style={{ color:"white", fontSize:"0.85rem" }}>{name}</span>
            </div>
            <button onClick={() => removeStaff(name)} style={{ background:"#FEE2E2", border:"none", borderRadius:6, padding:"3px 8px", fontSize:"0.68rem", color:"#991B1B", cursor:"pointer", fontWeight:600 }}>Remove</button>
          </div>
        ))}
      </div>
      <div style={{ display:"flex", gap:8, marginBottom:20 }}>
        <input value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key==="Enter" && addStaff()} placeholder="Staff name..." style={{ ...darkInput, flex:1 }} />
        <button onClick={addStaff} style={{ padding:"9px 14px", background:"#F97316", border:"none", borderRadius:8, color:"white", fontWeight:700, cursor:"pointer", fontSize:"0.82rem", whiteSpace:"nowrap" }}>+ Add</button>
      </div>
      <div style={{ fontSize:"0.7rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600, marginBottom:8 }}>Manager PIN (current: {"•".repeat(pin.length)})</div>
      <div style={{ display:"flex", gap:8 }}>
        <input value={newPin} onChange={e => setNewPin(e.target.value.replace(/\D/g,"").slice(0,4))} placeholder="New 4-digit PIN" style={{ ...darkInput, flex:1, letterSpacing:6 }} maxLength={4} />
        <button onClick={savePin} style={{ padding:"9px 14px", background: pinSaved ? "#16A34A" : "#F97316", border:"none", borderRadius:8, color:"white", fontWeight:700, cursor:"pointer", fontSize:"0.82rem", whiteSpace:"nowrap", transition:"background 0.3s" }}>
          {pinSaved ? "✓ Saved" : "Save PIN"}
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// PRICING MANAGER
// Owner controls:
//   - Pizza extra topping price per size
//   - Premium ingredient prices for salad/grinder
// ─────────────────────────────────────────────
function PricingManager({ pricing, onPricingChange, onPricingBatch }) {
  const [activeTab, setActiveTab] = useState("pizza");
  const [saved, setSaved]         = useState(null); // null | "pizza" | "salad" | "grinder"

  // ── Pizza: per-size extra topping price ──
  const [pizzaPrices, setPizzaPrices] = useState({
    S:  String(pricing?.pizza_extra_S  ?? 0.50),
    M:  String(pricing?.pizza_extra_M  ?? 0.60),
    L:  String(pricing?.pizza_extra_L  ?? 0.75),
    XL: String(pricing?.pizza_extra_XL ?? 1.00),
  });

  // ── Salad: flat price for extra ingredient + dressing ──
  const [saladIngPrice,      setSaladIngPrice]      = useState(String(pricing?.salad_extra_ing      ?? 0.00));
  const [saladDressingPrice, setSaladDressingPrice] = useState(String(pricing?.salad_extra_dressing ?? 0.00));

  // ── Grinder: flat price for extra ingredient ──
  const [grinderIngPrice, setGrinderIngPrice] = useState(String(pricing?.grinder_extra_ing ?? 0.00));

  // Sync when pricing loads from DB
  useEffect(() => {
    if (!pricing) return;
    setPizzaPrices({
      S:  String(pricing.pizza_extra_S  ?? 0.50),
      M:  String(pricing.pizza_extra_M  ?? 0.60),
      L:  String(pricing.pizza_extra_L  ?? 0.75),
      XL: String(pricing.pizza_extra_XL ?? 1.00),
    });
    setSaladIngPrice(String(pricing.salad_extra_ing      ?? 0.00));
    setSaladDressingPrice(String(pricing.salad_extra_dressing ?? 0.00));
    setGrinderIngPrice(String(pricing.grinder_extra_ing  ?? 0.00));
  }, [pricing]);

  const flash = (tab) => { setSaved(tab); setTimeout(() => setSaved(null), 2000); };

  const savePizza = () => {
    onPricingBatch({
      pizza_extra_S:  parseFloat(pizzaPrices.S)  || 0,
      pizza_extra_M:  parseFloat(pizzaPrices.M)  || 0,
      pizza_extra_L:  parseFloat(pizzaPrices.L)  || 0,
      pizza_extra_XL: parseFloat(pizzaPrices.XL) || 0,
    });
    flash("pizza");
  };

  const saveSalad = () => {
    onPricingBatch({
      salad_extra_ing:      parseFloat(saladIngPrice)      || 0,
      salad_extra_dressing: parseFloat(saladDressingPrice) || 0,
    });
    flash("salad");
  };

  const saveGrinder = () => {
    onPricingBatch({ grinder_extra_ing: parseFloat(grinderIngPrice) || 0 });
    flash("grinder");
  };

  const darkInput = { padding:"8px 10px", background:"#2A1200", border:"1px solid #3D1F00", borderRadius:8, color:"white", fontSize:"0.9rem", outline:"none", width:"100%", boxSizing:"border-box" };
  const tabStyle  = (key) => ({ padding:"7px 16px", borderRadius:20, border:`1.5px solid ${activeTab===key ? "#F97316" : "#3D1F00"}`, background: activeTab===key ? "#F97316" : "transparent", color: activeTab===key ? "white" : "#B89070", fontSize:"0.78rem", fontWeight:600, cursor:"pointer" });

  const PriceRow = ({ label, sub, value, onChange }) => (
    <div style={{ background:"#2A1200", borderRadius:10, padding:"12px 14px", border:"1px solid #3D1F00", marginBottom:10 }}>
      <div style={{ fontSize:"0.75rem", color:"white", fontWeight:600, marginBottom:2 }}>{label}</div>
      {sub && <div style={{ fontSize:"0.68rem", color:"#B89070", marginBottom:8 }}>{sub}</div>}
      <div style={{ display:"flex", alignItems:"center", gap:8 }}>
        <span style={{ color:"#F97316", fontSize:"1rem", fontWeight:700 }}>$</span>
        <input type="number" step="0.25" min="0" value={value} onChange={e => onChange(e.target.value)}
          style={{ ...darkInput, fontSize:"1.1rem", fontWeight:600, letterSpacing:1 }} />
        <span style={{ color:"#B89070", fontSize:"0.72rem", whiteSpace:"nowrap" }}>per item</span>
      </div>
    </div>
  );

  const SaveBtn = ({ onClick, tab, label }) => (
    <button onClick={onClick}
      style={{ width:"100%", padding:"10px", background: saved===tab ? "#16A34A" : "#F97316", border:"none", borderRadius:10, color:"white", fontWeight:700, fontSize:"0.85rem", cursor:"pointer", transition:"background 0.3s", marginTop:4 }}>
      {saved===tab ? "✓ Saved!" : label}
    </button>
  );

  return (
    <div style={{ marginTop:16, paddingTop:16, borderTop:"1px solid #3D1F00" }}>
      <div style={{ fontSize:"0.7rem", textTransform:"uppercase", letterSpacing:1, color:"#B89070", fontWeight:600, marginBottom:14 }}>💰 Pricing Config</div>

      <div style={{ display:"flex", gap:6, marginBottom:16 }}>
        <button style={tabStyle("pizza")}   onClick={() => setActiveTab("pizza")}>🍕 Pizza</button>
        <button style={tabStyle("salad")}   onClick={() => setActiveTab("salad")}>🥗 Salad</button>
        <button style={tabStyle("grinder")} onClick={() => setActiveTab("grinder")}>🥪 Grinder</button>
      </div>

      {activeTab === "pizza" && (
        <div>
          <div style={{ fontSize:"0.72rem", color:"#B89070", marginBottom:12, lineHeight:1.6 }}>
            Price charged per extra topping added beyond defaults, based on pizza size.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, marginBottom:12 }}>
            {[["S","Small"],["M","Medium"],["L","Large"],["XL","X-Large"]].map(([key, label]) => (
              <div key={key} style={{ background:"#2A1200", borderRadius:10, padding:"10px 12px", border:"1px solid #3D1F00" }}>
                <div style={{ fontSize:"0.72rem", color:"#B89070", fontWeight:600, marginBottom:6 }}>{label}</div>
                <div style={{ display:"flex", alignItems:"center", gap:6 }}>
                  <span style={{ color:"#F97316", fontWeight:700 }}>$</span>
                  <input type="number" step="0.05" min="0" value={pizzaPrices[key]}
                    onChange={e => setPizzaPrices(p => ({...p, [key]: e.target.value}))}
                    style={{ ...darkInput }} />
                </div>
                <div style={{ fontSize:"0.62rem", color:"#5A3A1A", marginTop:4 }}>per topping</div>
              </div>
            ))}
          </div>
          <SaveBtn onClick={savePizza} tab="pizza" label="Save Pizza Pricing" />
        </div>
      )}

      {activeTab === "salad" && (
        <div>
          <div style={{ fontSize:"0.72rem", color:"#B89070", marginBottom:12, lineHeight:1.6 }}>
            Price charged when a customer adds an ingredient or dressing that is not included by default.
          </div>
          <PriceRow
            label="Extra Ingredient"
            sub="e.g. customer adds Avocado, Grilled Chicken..."
            value={saladIngPrice}
            onChange={setSaladIngPrice}
          />
          <PriceRow
            label="Extra Dressing"
            sub="e.g. customer selects a dressing not included"
            value={saladDressingPrice}
            onChange={setSaladDressingPrice}
          />
          <SaveBtn onClick={saveSalad} tab="salad" label="Save Salad Pricing" />
        </div>
      )}

      {activeTab === "grinder" && (
        <div>
          <div style={{ fontSize:"0.72rem", color:"#B89070", marginBottom:12, lineHeight:1.6 }}>
            Price charged when a customer adds an ingredient not included by default.
          </div>
          <PriceRow
            label="Extra Ingredient"
            sub="e.g. customer adds Extra Meat, Provolone..."
            value={grinderIngPrice}
            onChange={setGrinderIngPrice}
          />
          <SaveBtn onClick={saveGrinder} tab="grinder" label="Save Grinder Pricing" />
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────
// STRIPE FORM
// Loads Stripe.js dynamically, mounts card element
// ─────────────────────────────────────────────
function StripeForm({ clientSecret, publishableKey, onSuccess, onError }) {
  const mountRef   = useRef(null);
  const stripeRef  = useRef(null);
  const elemRef    = useRef(null);
  const [ready,    setReady]    = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [cardErr,  setCardErr]  = useState("");

  useEffect(() => {
    // Dynamically load Stripe.js
    if (window.Stripe) { init(); return; }
    const script = document.createElement("script");
    script.src = "https://js.stripe.com/v3/";
    script.onload = init;
    document.head.appendChild(script);

    function init() {
      const stripe   = window.Stripe(publishableKey);
      stripeRef.current = stripe;
      const elements = stripe.elements({ clientSecret });
      const card     = elements.create("payment", {
        layout: "tabs",
        appearance: {
          theme: "stripe",
          variables: { colorPrimary: "#E8251A", borderRadius: "8px" },
        },
      });
      elemRef.current = { elements, card };
      card.mount(mountRef.current);
      card.on("ready", () => setReady(true));
      card.on("change", e => setCardErr(e.error ? e.error.message : ""));
    }

    return () => { elemRef.current?.card?.unmount(); };
  }, [clientSecret]);

  const handlePay = async () => {
    if (!stripeRef.current || !elemRef.current) return;
    setLoading(true); setCardErr("");
    const { error, paymentIntent } = await stripeRef.current.confirmPayment({
      elements: elemRef.current.elements,
      redirect: "if_required",
    });
    setLoading(false);
    if (error) { setCardErr(error.message); onError?.(error.message); }
    else if (paymentIntent?.status === "succeeded") { onSuccess(paymentIntent); }
    else { setCardErr("Payment incomplete. Please try again."); }
  };

  return (
    <div style={{ textAlign:"left" }}>
      <div ref={mountRef} style={{ minHeight:60, marginBottom:16 }} />
      {!ready && (
        <div style={{ textAlign:"center", color:"#7A5C40", fontSize:"0.82rem", marginBottom:12 }}>
          <div className="spinner" style={{ margin:"0 auto 8px", width:20, height:20 }} />
          Loading payment form...
        </div>
      )}
      {cardErr && (
        <div style={{ background:"#FEE2E2", color:"#991B1B", borderRadius:8, padding:"8px 12px", fontSize:"0.82rem", marginBottom:12 }}>{cardErr}</div>
      )}
      {ready && (
        <button onClick={handlePay} disabled={loading}
          style={{ width:"100%", padding:"16px", background: loading ? "#5A3A1A" : "#E8251A", color:"white", border:"none", borderRadius:12, fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.5rem", letterSpacing:3, cursor: loading ? "not-allowed" : "pointer", marginTop:8 }}>
          {loading ? "Processing..." : "PAY NOW"}
        </button>
      )}
    </div>
  );
}
