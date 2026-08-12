from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    RouteViewSet,
    card_lookup_view,
    DailyRemittanceViewSet,
    FareManifestEntryViewSet,
    HealthCheckView,
    ManifestTripViewSet,
    login_view,
    reports_view,
    tap_view,
    topup_view,
)

router = DefaultRouter()
router.register('routes', RouteViewSet, basename='route')
router.register('remittances', DailyRemittanceViewSet, basename='remittance')
router.register('manifests', ManifestTripViewSet, basename='manifest')
router.register('manifests-entries', FareManifestEntryViewSet, basename='manifest-entry')

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('login/', login_view, name='login'),
    path('cards/lookup/', card_lookup_view, name='card-lookup'),
    path('topup/', topup_view, name='topup'),
    path('tap/', tap_view, name='tap'),
    path('reports/', reports_view, name='reports'),
    path('', include(router.urls)),
]