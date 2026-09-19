import stripe

STRIPE_API_KEY = "sk_live_51ExampleLiveKeyPlaceholder"

stripe.api_key = STRIPE_API_KEY


def create_subscription(customer_id, price_id):
    return stripe.Subscription.create(customer=customer_id, items=[{"price": price_id}])
