from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import (
    admin_dashboard_view,
    admin_reports_export_view,
    audit_log_view,
    boarding_status_view,
    CardViewSet,
    DestinationViewSet,
    DispatcherViewSet,
    DriverViewSet,
    fee_settings_view,
    LineViewSet,
    PassengerViewSet,
    TerminalViewSet,
    UserViewSet,
    VehicleViewSet,
    card_lookup_view,
    card_search_view,
    cashier_cash_fares_report_view,
    cashier_transactions_report_view,
    DailyRemittanceViewSet,
    dispatch_round_admin_correct_view,
    FareManifestEntryViewSet,
    HealthCheckView,
    ManifestTripViewSet,
    login_view,
    manifest_entry_tally_view,
    manifest_entry_untally_view,
    manifest_trip_recent_taps_view,
    reports_view,
    tap_log_latest_public_view,
    tap_log_cancel_boarding_view,
    tap_log_recent_view,
    tap_destination_view,
    tap_view,
    topup_view,
)

router = DefaultRouter()
router.register('destinations', DestinationViewSet, basename='destination')
router.register('vehicles', VehicleViewSet, basename='vehicle')
router.register('lines', LineViewSet, basename='line')
router.register('terminals', TerminalViewSet, basename='terminal')
router.register('drivers', DriverViewSet, basename='driver')
router.register('dispatchers', DispatcherViewSet, basename='dispatcher')
router.register('passengers', PassengerViewSet, basename='passenger')
router.register('cards', CardViewSet, basename='card')
router.register('users', UserViewSet, basename='user')
router.register('remittances', DailyRemittanceViewSet, basename='remittance')
router.register('manifests', ManifestTripViewSet, basename='manifest')
router.register('manifest-entries', FareManifestEntryViewSet, basename='manifest-entry')

urlpatterns = [
    path('health/', HealthCheckView.as_view(), name='health-check'),
    path('admin/dashboard/', admin_dashboard_view, name='admin-dashboard'),
    path('admin/reports/export/', admin_reports_export_view, name='admin-reports-export'),
    path('audit-log/', audit_log_view, name='audit-log'),
    path('boarding-status/', boarding_status_view, name='boarding-status'),
    path('login/', login_view, name='login'),
    path('cards/lookup/', card_lookup_view, name='card-lookup'),
    path('cards/search/', card_search_view, name='card-search'),
    path('fee-settings/', fee_settings_view, name='fee-settings'),
    path('topup/', topup_view, name='topup'),
    path('tap-destination/', tap_destination_view, name='tap-destination'),
    path('tap/', tap_view, name='tap'),
    path('tap-log/recent/', tap_log_recent_view, name='tap-log-recent'),
    path('tap-log/latest-public/', tap_log_latest_public_view, name='tap-log-latest-public'),
    path('manifests/<int:pk>/recent-taps/', manifest_trip_recent_taps_view, name='manifest-trip-recent-taps'),
    path('tap-log/<int:pk>/cancel-boarding/', tap_log_cancel_boarding_view, name='tap-log-cancel-boarding'),
    path('reports/', reports_view, name='reports'),
    path('reports/cashier-transactions/', cashier_transactions_report_view, name='cashier-transactions-report'),
    path('reports/cashier-cash-fares/', cashier_cash_fares_report_view, name='cashier-cash-fares-report'),
    path('manifest-entries/tally/', manifest_entry_tally_view, name='manifest-entry-tally'),
    path('manifest-entries/untally/', manifest_entry_untally_view, name='manifest-entry-untally'),
    path('dispatch-rounds/<int:pk>/admin-correct/', dispatch_round_admin_correct_view, name='dispatch-round-admin-correct'),
    path('', include(router.urls)),
]