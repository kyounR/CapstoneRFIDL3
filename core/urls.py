from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    admin_dashboard_view,
    admin_reports_export_view,
    DestinationViewSet,
    DispatcherViewSet,
    DriverViewSet,
    TerminalViewSet,
    VehicleViewSet,
    card_lookup_view,
    DailyRemittanceViewSet,
    dispatch_round_admin_correct_view,
    FareManifestEntryViewSet,
    HealthCheckView,
    ManifestTripViewSet,
    login_view,
    manifest_entry_tally_view,
    manifest_entry_untally_view,
    reports_view,
    tap_log_recent_view,
    tap_view,
    topup_view,
)

router = DefaultRouter()
router.register('destinations', DestinationViewSet, basename='destination')
router.register('vehicles', VehicleViewSet, basename='vehicle')
router.register('terminals', TerminalViewSet, basename='terminal')
router.register('drivers', DriverViewSet, basename='driver')
router.register('dispatchers', DispatcherViewSet, basename='dispatcher')
router.register('remittances', DailyRemittanceViewSet, basename='remittance')
router.register('manifests', ManifestTripViewSet, basename='manifest')
router.register('manifest-entries', FareManifestEntryViewSet, basename='manifest-entry')

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('admin/dashboard/', admin_dashboard_view, name='admin-dashboard'),
    path('admin/reports/export/', admin_reports_export_view, name='admin-reports-export'),
    path('login/', login_view, name='login'),
    path('cards/lookup/', card_lookup_view, name='card-lookup'),
    path('topup/', topup_view, name='topup'),
    path('tap/', tap_view, name='tap'),
    path('tap-log/recent/', tap_log_recent_view, name='tap-log-recent'),
    path('reports/', reports_view, name='reports'),
    path('manifest-entries/tally/', manifest_entry_tally_view, name='manifest-entry-tally'),
    path('manifest-entries/untally/', manifest_entry_untally_view, name='manifest-entry-untally'),
    path('dispatch-rounds/<int:pk>/admin-correct/', dispatch_round_admin_correct_view, name='dispatch-round-admin-correct'),
    path('', include(router.urls)),
]