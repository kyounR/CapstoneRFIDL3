import csv
from io import StringIO
from datetime import timedelta
from decimal import Decimal
from typing import Optional

from django.contrib.auth import authenticate
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.db.models.deletion import ProtectedError
from django.db.models import Count, Q, Sum
from django.db.models.functions import Coalesce
from django.forms.models import model_to_dict
from django.http import HttpResponse
from django.utils.dateparse import parse_date, parse_time
from django.utils.timezone import localdate, now
from rest_framework import serializers, status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import AdminAuditLog, Card, CurrentTapSelection, DailyRemittance, Destination, DispatchRound, Dispatcher, Driver, FareManifestEntry, FeeSettings, Line, ManifestCorrection, ManifestTrip, Passenger, RemittanceCorrection, TapLog, Terminal, Transaction, Trip, User, Vehicle
from .serializers import (
    AdminAuditLogSerializer,
    CardSerializer,
    DailyRemittanceSerializer,
    DispatchRoundSerializer,
    FareManifestEntrySerializer,
    FeeSettingsSerializer,
    LineSerializer,
    ManifestCorrectionSerializer,
    ManifestTripSerializer,
    DestinationSerializer,
    DispatcherSerializer,
    DriverSerializer,
    PassengerSerializer,
    RemittanceCorrectionSerializer,
    TerminalSerializer,
    UserAdminSerializer,
    VehicleSerializer,
)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'status': 'ok', 'service': 'fareback'})


def _has_cashier_or_admin_role(request):
    return getattr(request.user, 'role', None) in {'cashier', 'admin'}


def _has_admin_role(request):
    return getattr(request.user, 'role', None) == 'admin'


def _role_forbidden_response(action_label):
    return Response(
        {'error': f'Only cashier or admin users can {action_label}.'},
        status=status.HTTP_403_FORBIDDEN,
    )


def _audit_value(value):
    if hasattr(value, 'pk'):
        return value.pk
    if isinstance(value, Decimal):
        return str(value)
    if hasattr(value, 'isoformat'):
        return value.isoformat()
    return value


def _audit_changes(data):
    return {
        field_name: '(set)' if field_name == 'password' else _audit_value(value)
        for field_name, value in data.items()
    }


def log_admin_action(user, action, instance, changes=None, model_name=None, object_repr=None):
    return AdminAuditLog.objects.create(
        actor=user if getattr(user, 'is_authenticated', False) else None,
        action=action,
        model_name=model_name or instance.__class__.__name__,
        object_repr=object_repr or str(instance),
        changes=changes,
    )


class AdminAuditMixin:
    def perform_create(self, serializer):
        submitted_data = dict(serializer.validated_data)
        instance = serializer.save()
        log_admin_action(self.request.user, 'created', instance, _audit_changes(submitted_data))

    def perform_update(self, serializer):
        old_values = model_to_dict(serializer.instance)
        instance = serializer.save()
        changes = {
            field_name: [_audit_value(old_values.get(field_name)), _audit_value(new_value)]
            for field_name, new_value in serializer.validated_data.items()
            if _audit_value(old_values.get(field_name)) != _audit_value(new_value)
        }
        if changes:
            log_admin_action(self.request.user, 'updated', instance, changes)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        object_repr = str(instance)
        try:
            self.perform_destroy(instance)
        except ProtectedError:
            return Response(
                {'error': f"This {instance._meta.verbose_name} is still in use and can't be deleted."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        log_admin_action(request.user, 'deleted', instance, object_repr=object_repr)
        return Response(status=status.HTTP_204_NO_CONTENT)


def _get_report_date_range(request):
    start_date_param = request.query_params.get('start_date')
    end_date_param = request.query_params.get('end_date')
    if not start_date_param or not end_date_param:
        return None, Response(
            {'error': 'start_date and end_date are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    start_date = parse_date(start_date_param)
    end_date = parse_date(end_date_param)
    if start_date is None or end_date is None:
        return None, Response(
            {'error': 'start_date and end_date must use YYYY-MM-DD format.'},
            status=status.HTTP_400_BAD_REQUEST,
        )
    if start_date > end_date:
        return None, Response(
            {'error': 'start_date cannot be after end_date.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return (start_date, end_date), None


def _finalized_entries_in_date_range(start_date, end_date):
    return FareManifestEntry.objects.filter(
        manifest_trip__is_finalized=True,
        manifest_trip__date__range=(start_date, end_date),
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_dashboard_view(request):
    if not _has_admin_role(request):
        return Response(
            {'error': 'Only admin users can access the dashboard.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    date_range, error_response = _get_report_date_range(request)
    if error_response is not None:
        return error_response

    assert date_range is not None
    start_date, end_date = date_range
    finalized_entries = _finalized_entries_in_date_range(start_date, end_date)
    totals = finalized_entries.aggregate(
        total_passengers=Sum('passenger_count'),
        total_income=Sum('total_fare'),
        total_discount_passengers=Sum('discount_count'),
    )
    trip_count = ManifestTrip.objects.filter(
        is_finalized=True,
        date__range=(start_date, end_date),
    ).count()
    popular_destinations = finalized_entries.values(
        'destination_id',
        'destination__destination_name',
    ).annotate(
        passenger_count=Sum('passenger_count'),
        total_fare=Sum('total_fare'),
    ).order_by('-passenger_count', 'destination__destination_name')
    daily_breakdown = finalized_entries.values(
        'manifest_trip__date',
    ).annotate(
        total_passengers=Sum('passenger_count'),
        total_income=Sum('total_fare'),
    ).order_by('manifest_trip__date')

    return Response(
        {
            'total_passengers': totals['total_passengers'] or 0,
            'total_income': totals['total_income'] or Decimal('0.00'),
            'total_discount_passengers': totals['total_discount_passengers'] or 0,
            'trip_count': trip_count,
            'popular_destinations': [
                {
                    'destination_id': row['destination_id'],
                    'destination_name': row['destination__destination_name'],
                    'passenger_count': row['passenger_count'],
                    'total_fare': row['total_fare'],
                }
                for row in popular_destinations
            ],
            'daily_breakdown': [
                {
                    'date': row['manifest_trip__date'],
                    'total_passengers': row['total_passengers'],
                    'total_income': row['total_income'],
                }
                for row in daily_breakdown
            ],
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def admin_reports_export_view(request):
    if not _has_admin_role(request):
        return Response(
            {'error': 'Only admin users can export reports.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    date_range, error_response = _get_report_date_range(request)
    if error_response is not None:
        return error_response

    assert date_range is not None
    start_date, end_date = date_range
    finalized_entries = _finalized_entries_in_date_range(start_date, end_date)
    totals = finalized_entries.aggregate(
        total_passengers=Sum('passenger_count'),
        total_discount_passengers=Sum('discount_count'),
        total_income=Sum('total_fare'),
    )
    entries = finalized_entries.select_related(
        'manifest_trip',
        'destination',
    ).order_by('manifest_trip__date', 'destination__destination_name', 'id')

    output = StringIO()
    writer = csv.writer(output)
    writer.writerow(['Date', 'Destination', 'Passenger Count', 'Discount Count', 'Total Fare'])
    for entry in entries:
        writer.writerow([
            entry.manifest_trip.date,
            entry.destination.destination_name,
            entry.passenger_count,
            entry.discount_count,
            entry.total_fare,
        ])
    writer.writerow([
        'TOTAL',
        '',
        totals['total_passengers'] or 0,
        totals['total_discount_passengers'] or 0,
        totals['total_income'] or Decimal('0.00'),
    ])

    response = HttpResponse(output.getvalue(), content_type='text/csv')
    response['Content-Disposition'] = (
        f'attachment; filename="caltransco_report_{start_date}_to_{end_date}.csv"'
    )
    return response


@api_view(['POST'])
@authentication_classes([])
@permission_classes([AllowAny])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')

    if not username or not password:
        return Response(
            {'error': 'username and password are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = authenticate(username=username, password=password)
    if user is None:
        return Response({'error': 'Invalid credentials.'}, status=status.HTTP_401_UNAUTHORIZED)

    token, _ = Token.objects.get_or_create(user=user)
    return Response(
        {
            'token': token.key,
            'username': user.username,
            'role': getattr(user, 'role', None),
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def card_lookup_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('look up cards')

    uid = request.query_params.get('uid')
    if not uid:
        return Response({'error': 'uid query parameter is required.'}, status=status.HTTP_400_BAD_REQUEST)

    card = Card.objects.select_related('passenger').filter(uid=uid).first()
    if card is None:
        return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)

    passenger_data = None
    if card.passenger is not None:
        passenger_data = {
            'full_name': card.passenger.full_name,
            'discount_type': card.passenger.discount_type,
        }

    return Response(
        {
            'uid': card.uid,
            'balance': card.balance,
            'status': card.status,
            'passenger': passenger_data,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def card_search_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('search cards')

    q = request.query_params.get('q', '').strip()
    if not q or len(q) < 2:
        return Response(
            {'error': 'Query parameter q must be at least 2 characters long.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Search cards by passenger full_name (case-insensitive partial match)
    cards = Card.objects.filter(
        passenger__full_name__icontains=q,
    ).select_related('passenger').order_by('passenger__full_name')[:10]

    results = []
    for card in cards:
        passenger_data = None
        if card.passenger is not None:
            passenger_data = {
                'full_name': card.passenger.full_name,
                'discount_type': card.passenger.discount_type,
            }

        results.append({
            'id': card.id,
            'uid': card.uid,
            'balance': card.balance,
            'status': card.status,
            'passenger': passenger_data,
        })

    return Response(results, status=status.HTTP_200_OK)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def fee_settings_view(request):
    if not _has_admin_role(request):
        return _role_forbidden_response('access fee settings')

    if request.method == 'GET':
        fee_settings = FeeSettings.get_current()
        serializer = FeeSettingsSerializer(fee_settings)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method == 'PATCH':
        fee_settings = FeeSettings.get_current()
        old_values = model_to_dict(fee_settings)
        serializer = FeeSettingsSerializer(fee_settings, data=request.data, partial=True)
        if serializer.is_valid():
            updated_settings = serializer.save()
            changes = {
                field_name: [_audit_value(old_values.get(field_name)), _audit_value(new_value)]
                for field_name, new_value in serializer.validated_data.items()
                if _audit_value(old_values.get(field_name)) != _audit_value(new_value)
            }
            if changes:
                log_admin_action(request.user, 'updated', updated_settings, changes)
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def audit_log_view(request):
    if not _has_admin_role(request):
        return _role_forbidden_response('access the audit log')

    logs = AdminAuditLog.objects.select_related('actor').order_by('-timestamp')
    model_name = request.query_params.get('model_name')
    if model_name:
        logs = logs.filter(model_name=model_name)

    date_param = request.query_params.get('date')
    if date_param:
        audit_date = parse_date(date_param)
        if audit_date is None:
            return Response(
                {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        logs = logs.filter(timestamp__date=audit_date)

    return Response(AdminAuditLogSerializer(logs[:100], many=True).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def topup_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('perform top-ups')

    card_uid = request.data.get('card_uid')
    amount_raw = request.data.get('amount')

    if not card_uid:
        return Response({'error': 'card_uid is required.'}, status=status.HTTP_400_BAD_REQUEST)

    try:
        amount = Decimal(str(amount_raw))
    except Exception:
        return Response({'error': 'amount must be a valid number.'}, status=status.HTTP_400_BAD_REQUEST)

    if amount <= 0:
        return Response({'error': 'amount must be greater than 0.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        card = Card.objects.select_for_update().filter(uid=card_uid).first()
        if card is None:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        if card.status != Card.Status.ACTIVE:
            return Response(
                {'error': 'Card is not active.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        card.balance = card.balance + amount
        card.save(update_fields=['balance'])

        Transaction.objects.create(
            card=card,
            cashier=request.user,
            transaction_type=Transaction.TransactionType.TOPUP,
            amount=amount,
            balance_after=card.balance,
        )

    return Response(
        {
            'message': 'Top-up successful.',
            'card_uid': card.uid,
            'balance': card.balance,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST', 'GET', 'DELETE'])
@permission_classes([IsAuthenticated])
def tap_destination_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('manage the tap destination')

    selection = CurrentTapSelection.get_current()
    if request.method == 'DELETE':
        selection.destination = None
        selection.manifest_trip = None
        selection.set_by = None
        selection.set_at = None
        selection.save(update_fields=['destination', 'manifest_trip', 'set_by', 'set_at'])
        return Response(None, status=status.HTTP_200_OK)

    if request.method == 'GET':
        if selection.destination is None or selection.manifest_trip is None:
            return Response(None, status=status.HTTP_200_OK)
        return Response(
            {
                'destination_id': selection.destination_id,
                'destination_name': selection.destination.destination_name,
                'manifest_trip_id': selection.manifest_trip_id,
                'plate_number': selection.manifest_trip.vehicle.plate_number,
                'set_by': selection.set_by.username if selection.set_by else None,
                'set_at': selection.set_at,
            },
            status=status.HTTP_200_OK,
        )

    manifest_trip_id = request.data.get('manifest_trip_id')
    if not manifest_trip_id:
        return Response(
            {'error': 'manifest_trip_id is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    manifest_trip = ManifestTrip.objects.select_related('vehicle').filter(
        id=manifest_trip_id,
        is_finalized=False,
    ).first()
    if manifest_trip is None:
        return Response(
            {'error': 'ManifestTrip does not exist or is already finalized.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    destination = Destination.objects.filter(
        id=request.data.get('destination_id'),
        is_active=True,
    ).first()
    if destination is None:
        return Response(
            {'error': 'Destination does not exist or is inactive.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    selection.destination = destination
    selection.manifest_trip = manifest_trip
    selection.set_by = request.user
    selection.set_at = now()
    selection.save(update_fields=['destination', 'manifest_trip', 'set_by', 'set_at'])
    return Response(
        {
            'destination_id': destination.id,
            'destination_name': destination.destination_name,
            'manifest_trip_id': manifest_trip.id,
            'plate_number': manifest_trip.vehicle.plate_number,
            'set_by': request.user.username,
            'set_at': selection.set_at,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([AllowAny])
def tap_view(request):
    card_uid = request.data.get('card_uid')

    if not card_uid:
        return Response({'error': 'card_uid is required.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        # of=('self',) avoids FOR UPDATE across the LEFT OUTER JOIN from nullable Card.passenger
        card = Card.objects.select_for_update(of=('self',)).select_related('passenger').filter(uid=card_uid).first()
        if card is None:
            TapLog.objects.create(
                card_uid=card_uid,
                success=False,
                message='Card not found.',
            )
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        if card.status != Card.Status.ACTIVE:
            TapLog.objects.create(
                card_uid=card_uid,
                card=card,
                passenger_name=card.passenger.full_name if card.passenger else '',
                success=False,
                message='Card is not active.',
                remaining_balance=card.balance,
            )
            return Response({'error': 'Card is not active.'}, status=status.HTTP_400_BAD_REQUEST)

        last_fare_txn = Transaction.objects.filter(
            card=card,
            transaction_type=Transaction.TransactionType.FARE,
        ).order_by('-timestamp').first()
        if last_fare_txn is not None and now() - last_fare_txn.timestamp < timedelta(seconds=7):
            cooldown_message = 'This card was just tapped. Please wait a moment before tapping again.'
            TapLog.objects.create(
                card_uid=card_uid,
                card=card,
                passenger_name=card.passenger.full_name if card.passenger else '',
                success=False,
                message=cooldown_message,
                remaining_balance=card.balance,
            )
            return Response(
                {
                    'success': False,
                    'error': cooldown_message,
                    'remaining_balance': card.balance,
                },
                status=status.HTTP_200_OK,
            )

        tap_selection = CurrentTapSelection.objects.select_for_update(of=('self',)).select_related(
            'destination',
            'manifest_trip__vehicle',
        ).get_or_create(pk=1)[0]
        destination = tap_selection.destination
        if destination is None:
            no_destination_message = 'No destination selected. Ask the cashier to select a destination before tapping.'
            TapLog.objects.create(
                card_uid=card_uid,
                card=card,
                passenger_name=card.passenger.full_name if card.passenger else '',
                success=False,
                message=no_destination_message,
                remaining_balance=card.balance,
            )
            return Response({'error': no_destination_message}, status=status.HTTP_400_BAD_REQUEST)

        manifest_trip = tap_selection.manifest_trip
        if manifest_trip is None:
            no_manifest_message = 'No active Travel Pass selected for tapping. Ask the cashier to select a destination from an active Travel Pass first.'
            TapLog.objects.create(
                card_uid=card_uid,
                card=card,
                destination=destination,
                passenger_name=card.passenger.full_name if card.passenger else '',
                success=False,
                message=no_manifest_message,
                remaining_balance=card.balance,
            )
            return Response({'error': no_manifest_message}, status=status.HTTP_400_BAD_REQUEST)

        manifest_trip = ManifestTrip.objects.select_for_update().get(pk=manifest_trip.pk)
        if manifest_trip.is_finalized:
            no_manifest_message = 'No active Travel Pass selected for tapping. Ask the cashier to select a destination from an active Travel Pass first.'
            TapLog.objects.create(
                card_uid=card_uid,
                card=card,
                destination=destination,
                passenger_name=card.passenger.full_name if card.passenger else '',
                success=False,
                message=no_manifest_message,
                remaining_balance=card.balance,
            )
            return Response({'error': no_manifest_message}, status=status.HTTP_400_BAD_REQUEST)

        passenger = card.passenger
        passenger_discount_type: Optional[str] = None if passenger is None else passenger.discount_type
        use_discount = (
            passenger_discount_type
            in {
                Passenger.DiscountType.STUDENT,
                Passenger.DiscountType.SENIOR,
                Passenger.DiscountType.PWD,
            }
        )

        if use_discount:
            fare = destination.discount_fare
            fare_type = 'discount'
            reason = f'Discount fare applied for passenger type: {passenger_discount_type}.'
        else:
            fare = destination.base_fare
            fare_type = 'base'
            if passenger is None:
                reason = 'Base fare applied because card has no linked passenger.'
            else:
                reason = 'Base fare applied for regular passenger.'

        if card.balance < fare:
            TapLog.objects.create(
                card_uid=card_uid,
                card=card,
                destination=destination,
                passenger_name=passenger.full_name if passenger else '',
                success=False,
                message='Insufficient balance.',
                remaining_balance=card.balance,
            )
            return Response(
                {
                    'success': False,
                    'error': 'Insufficient balance.',
                    'required_fare': fare,
                    'remaining_balance': card.balance,
                    'fare_type': fare_type,
                    'reason': reason,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        card.balance = card.balance - fare
        card.save(update_fields=['balance'])

        Transaction.objects.create(
            card=card,
            cashier=None,
            transaction_type=Transaction.TransactionType.FARE,
            amount=fare,
            destination=destination,
            balance_after=card.balance,
        )

        tap_log = TapLog.objects.create(
            card_uid=card_uid,
            card=card,
            destination=destination,
            manifest_trip=manifest_trip,
            passenger_name=passenger.full_name if passenger else '',
            success=True,
            message=reason,
            fare_type=fare_type,
            fare_charged=fare,
            remaining_balance=card.balance,
        )

        entry = FareManifestEntry.objects.select_for_update().filter(
            manifest_trip=manifest_trip,
            destination=destination,
        ).first()
        if entry is None:
            entry = FareManifestEntry(
                manifest_trip=manifest_trip,
                destination=destination,
                passenger_count=0,
                discount_count=0,
                total_fare=Decimal('0.00'),
                source=FareManifestEntry.Source.RFID,
            )

        entry.passenger_count += 1
        if use_discount:
            entry.discount_count += 1
        _recompute_manifest_entry_total(entry)
        entry.save()

        tap_selection.destination = None
        tap_selection.set_by = None
        tap_selection.set_at = None
        tap_selection.manifest_trip = None
        tap_selection.save(update_fields=['destination', 'manifest_trip', 'set_by', 'set_at'])

    return Response(
        {
            'success': True,
            'fare_type': fare_type,
            'reason': reason,
            'applied_fare': fare,
            'remaining_balance': card.balance,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def tap_log_recent_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('view the tap log')

    logs = TapLog.objects.select_related('destination').order_by('-timestamp')[:20]

    return Response(
        [
            {
                'id': log.id,
                'card_uid': log.card_uid,
                'destination_name': log.destination.destination_name if log.destination else None,
                'passenger_name': log.passenger_name,
                'success': log.success,
                'message': log.message,
                'fare_charged': log.fare_charged,
                'remaining_balance': log.remaining_balance,
                'timestamp': log.timestamp,
            }
            for log in logs
        ],
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def manifest_trip_recent_taps_view(request, pk):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('view recent taps')

    taps = TapLog.objects.filter(
        manifest_trip_id=pk,
        success=True,
        refunded=False,
    ).select_related('destination').order_by('-timestamp')[:10]

    return Response(
        [
            {
                'id': tap.id,
                'card_uid': tap.card_uid,
                'passenger_name': tap.passenger_name,
                'destination_name': tap.destination.destination_name if tap.destination else None,
                'fare_charged': tap.fare_charged,
                'timestamp': tap.timestamp,
            }
            for tap in taps
        ],
        status=status.HTTP_200_OK,
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def tap_log_cancel_boarding_view(request, pk):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('cancel boarding')

    with transaction.atomic():
        tap_log = TapLog.objects.select_for_update(of=('self',)).select_related('destination', 'card').filter(pk=pk).first()
        if tap_log is None:
            return Response({'error': 'TapLog not found.'}, status=status.HTTP_404_NOT_FOUND)
        if not tap_log.success:
            return Response({'error': 'Only successful taps can be cancelled.'}, status=status.HTTP_400_BAD_REQUEST)
        if tap_log.refunded:
            return Response({'error': 'This tap has already been refunded.'}, status=status.HTTP_400_BAD_REQUEST)
        if tap_log.manifest_trip_id is None:
            return Response({'error': 'This tap is not linked to a Travel Pass.'}, status=status.HTTP_400_BAD_REQUEST)

        manifest_trip = ManifestTrip.objects.select_for_update().filter(pk=tap_log.manifest_trip_id).first()
        if manifest_trip is None:
            return Response({'error': 'ManifestTrip not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if manifest_trip.is_finalized:
            return Response({'error': 'Cannot cancel a tap from a finalized ManifestTrip.'}, status=status.HTTP_400_BAD_REQUEST)
        if tap_log.card is None or tap_log.fare_charged is None or tap_log.destination is None:
            return Response({'error': 'This tap is missing refund data.'}, status=status.HTTP_400_BAD_REQUEST)

        card = Card.objects.select_for_update().get(pk=tap_log.card_id)
        card.balance += tap_log.fare_charged
        card.save(update_fields=['balance'])

        Transaction.objects.create(
            card=card,
            cashier=request.user,
            transaction_type=Transaction.TransactionType.REFUND,
            amount=tap_log.fare_charged,
            destination=tap_log.destination,
            balance_after=card.balance,
        )

        entry = FareManifestEntry.objects.select_for_update().filter(
            manifest_trip=manifest_trip,
            destination=tap_log.destination,
        ).first()
        if entry is None:
            return Response({'error': 'Matching manifest entry not found.'}, status=status.HTTP_400_BAD_REQUEST)
        if entry.passenger_count <= 0:
            return Response({'error': 'Cannot reduce passenger count below zero.'}, status=status.HTTP_400_BAD_REQUEST)
        if tap_log.fare_type == 'discount' and entry.discount_count <= 0:
            return Response({'error': 'Cannot reduce discount count below zero.'}, status=status.HTTP_400_BAD_REQUEST)

        entry.passenger_count -= 1
        if tap_log.fare_type == 'discount':
            entry.discount_count -= 1
        _recompute_manifest_entry_total(entry)
        entry.save(update_fields=['passenger_count', 'discount_count', 'total_fare'])

        tap_log.refunded = True
        tap_log.refunded_at = now()
        tap_log.refunded_by = request.user
        tap_log.save(update_fields=['refunded', 'refunded_at', 'refunded_by'])

    return Response(
        {
            'balance': card.balance,
            'manifest_entry': FareManifestEntrySerializer(entry).data,
        },
        status=status.HTTP_200_OK,
    )


def _derive_display_name(passenger_name):
    if not passenger_name:
        return 'Passenger'
    parts = passenger_name.split()
    if len(parts) == 1:
        return parts[0]
    return f'{parts[0]} {parts[-1][0]}.'


@api_view(['GET'])
@permission_classes([AllowAny])
def tap_log_latest_public_view(request):
    log = TapLog.objects.select_related('destination').order_by('-timestamp').first()
    if log is None:
        return Response(None, status=status.HTTP_200_OK)

    payload = {
        'display_name': _derive_display_name(log.passenger_name),
        'destination_name': log.destination.destination_name if log.destination else None,
        'success': log.success,
        'timestamp': log.timestamp,
    }
    if not log.success:
        payload['message'] = log.message

    return Response(payload, status=status.HTTP_200_OK)


@api_view(['GET'])
@permission_classes([AllowAny])
def boarding_status_view(request):
    boarding_trips = ManifestTrip.objects.filter(
        is_finalized=False,
    ).select_related(
        'vehicle__line',
    ).annotate(
        passenger_total=Coalesce(Sum('entries__passenger_count'), 0),
    ).order_by('vehicle__line__name', 'id')

    boarding_by_line = {}
    for manifest in boarding_trips:
        line_name = manifest.vehicle.line.name
        boarding_by_line.setdefault(line_name, []).append({
            'manifest_trip_id': manifest.id,
            'plate_number': manifest.vehicle.plate_number,
            'total_passengers': manifest.passenger_total,
            'is_primary': False,
        })

    boarding = []
    for line_name, vehicles in boarding_by_line.items():
        vehicles[0]['is_primary'] = True
        boarding.append({'line_name': line_name, 'vehicles': vehicles})

    recently_departed = ManifestTrip.objects.filter(
        is_finalized=True,
        finalized_at__gte=now() - timedelta(minutes=2),
    ).select_related(
        'vehicle__line',
    ).order_by('-finalized_at', '-id')

    return Response(
        {
            'boarding': boarding,
            'recently_departed': [
                {
                    'plate_number': manifest.vehicle.plate_number,
                    'line_name': manifest.vehicle.line.name,
                    'departure_time': manifest.departure_time,
                }
                for manifest in recently_departed
            ],
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def reports_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('access reports')

    date_param = request.query_params.get('date')
    report_date = localdate() if not date_param else parse_date(date_param)

    if report_date is None:
        return Response(
            {'error': 'Invalid date format. Use YYYY-MM-DD.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    tx_qs = Transaction.objects.filter(timestamp__date=report_date)

    totals = tx_qs.aggregate(
        total_topups=Sum('amount', filter=Q(transaction_type=Transaction.TransactionType.TOPUP)),
        total_fares=Sum('amount', filter=Q(transaction_type=Transaction.TransactionType.FARE)),
        transaction_count=Count('id'),
    )

    cashier_breakdown_qs = (
        tx_qs.filter(transaction_type=Transaction.TransactionType.TOPUP, cashier__isnull=False)
        .values('cashier', 'cashier__username')
        .annotate(total_topups=Sum('amount'), topup_count=Count('id'))
        .order_by('cashier__username')
    )

    cashier_breakdown = [
        {
            'cashier_id': row['cashier'],
            'cashier_username': row['cashier__username'],
            'total_topups': row['total_topups'] or Decimal('0.00'),
            'topup_count': row['topup_count'],
        }
        for row in cashier_breakdown_qs
    ]

    return Response(
        {
            'date': report_date,
            'total_topups_amount': totals['total_topups'] or Decimal('0.00'),
            'total_fare_amount': totals['total_fares'] or Decimal('0.00'),
            'transaction_count': totals['transaction_count'] or 0,
            'cashier_topup_breakdown': cashier_breakdown,
        },
        status=status.HTTP_200_OK,
    )


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def cashier_transactions_report_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('access cashier transactions')

    cashier_id = request.query_params.get('cashier_id')
    date_param = request.query_params.get('date')
    if not cashier_id or not date_param:
        return Response(
            {'error': 'cashier_id and date are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    report_date = parse_date(date_param)
    if report_date is None:
        return Response(
            {'error': 'Invalid date format. Use YYYY-MM-DD.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    transactions = Transaction.objects.filter(
        cashier_id=cashier_id,
        timestamp__date=report_date,
        transaction_type=Transaction.TransactionType.TOPUP,
    ).select_related('card__passenger').order_by('-timestamp')

    return Response([
        {
            'card_uid': transaction.card.uid,
            'passenger_name': transaction.card.passenger.full_name if transaction.card.passenger else '',
            'amount': transaction.amount,
            'balance_after': transaction.balance_after,
            'timestamp': transaction.timestamp,
        }
        for transaction in transactions
    ])


class DailyRemittanceViewSet(viewsets.ModelViewSet):
    queryset = DailyRemittance.objects.all().order_by('-date', '-id')
    serializer_class = DailyRemittanceSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')

    def perform_create(self, serializer):
        fee_settings = FeeSettings.get_current()
        vehicle = serializer.validated_data['vehicle']
        defaults = {
            'terminal_fee_percentage': fee_settings.terminal_fee_percentage,
            'ps_fee': fee_settings.ps_fee,
            'water_fee': fee_settings.water_fee,
            'dispatcher_collection_fee': fee_settings.dispatcher_collection_fee,
            'ftb': fee_settings.ftb,
            'savings': fee_settings.savings,
            'trust_fund': fee_settings.trust_fund,
            'original_assigned_driver': vehicle.assigned_driver,
            'cashier': self.request.user,
        }
        defaults = {
            field_name: value
            for field_name, value in defaults.items()
            if field_name not in serializer.validated_data
        }
        serializer.save(**defaults)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.queryset)
        date_param = request.query_params.get('date')
        if date_param:
            remittance_date = parse_date(date_param)
            if remittance_date is None:
                return Response(
                    {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(date=remittance_date)

        finalized_param = request.query_params.get('is_finalized')
        if finalized_param is not None:
            if finalized_param.lower() not in {'true', 'false'}:
                return Response(
                    {'error': 'is_finalized must be true or false.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(is_finalized=finalized_param.lower() == 'true')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(self.get_serializer(queryset, many=True).data, status=status.HTTP_200_OK)

    def perform_update(self, serializer):
        if serializer.instance.is_finalized:
            raise serializers.ValidationError(
                {'error': 'This Daily Remittance has been finalized and can no longer be edited.'}
        )
        serializer.save()

    def perform_destroy(self, instance):
        if instance.is_finalized:
            raise serializers.ValidationError(
                {'error': 'This Daily Remittance has been finalized and can no longer be edited.'}
        )
        instance.delete()

    @action(detail=True, methods=['POST'], url_path='cancel')
    def cancel(self, request, pk=None):
        with transaction.atomic():
            remittance = DailyRemittance.objects.select_for_update().filter(pk=pk).first()
            if remittance is None:
                return Response(
                    {'error': 'Daily Remittance not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if remittance.is_finalized:
                return Response(
                    {'error': 'Cannot cancel a finalized Daily Remittance.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            round_count = DispatchRound.objects.filter(
                remittance=remittance,
            ).count()
            had_rounds = round_count > 0
            vehicle_plate = remittance.vehicle.plate_number
            driver_name = remittance.driver.full_name if remittance.driver else 'No driver'
            object_repr = f'{vehicle_plate} - {driver_name} - {remittance.date} (had_rounds={had_rounds}, round_count={round_count})'

            DispatchRound.objects.filter(remittance=remittance).delete()
            remittance.delete()
            log_admin_action(request.user, 'deleted', remittance, model_name='DailyRemittance', object_repr=object_repr)

        return Response(
            {
                'message': 'Daily Remittance cancelled successfully.',
                'had_rounds': had_rounds,
                'round_count': round_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['POST'], url_path='admin-correct')
    def admin_correct(self, request, pk=None):
        if not _has_admin_role(request):
            return Response(
                {'error': 'Only admin users can create remittance corrections.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = request.data.get('reason')
        if not isinstance(reason, str) or not reason.strip():
            return Response(
                {'error': 'A non-empty reason is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        editable_fields = (
            'terminal', 'date', 'driver', 'dispatcher', 'substitute_fee', 'ps_fee',
            'water_fee', 'dispatcher_collection_fee', 'ftb', 'savings',
            'trust_fund',
        )
        with transaction.atomic():
            try:
                remittance = DailyRemittance.objects.select_for_update().get(pk=pk)
            except DailyRemittance.DoesNotExist:
                return Response({'error': 'Daily Remittance not found.'}, status=status.HTTP_404_NOT_FOUND)

            if not remittance.is_finalized:
                return Response(
                    {'error': 'Only finalized Daily Remittances can be corrected.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            changes = []
            for field_name in editable_fields:
                if field_name not in request.data:
                    continue
                raw_value = request.data[field_name]
                old_value = getattr(remittance, field_name)
                corrected_value = raw_value

                if field_name == 'terminal':
                    try:
                        corrected_value = Terminal.objects.get(pk=raw_value)
                    except (Terminal.DoesNotExist, TypeError, ValueError):
                        return Response({'error': 'A valid terminal is required.'}, status=status.HTTP_400_BAD_REQUEST)
                elif field_name == 'driver':
                    try:
                        corrected_value = Driver.objects.get(pk=raw_value)
                    except (Driver.DoesNotExist, TypeError, ValueError):
                        return Response({'error': 'A valid driver is required.'}, status=status.HTTP_400_BAD_REQUEST)
                elif field_name == 'dispatcher':
                    try:
                        corrected_value = Dispatcher.objects.get(pk=raw_value)
                    except (Dispatcher.DoesNotExist, TypeError, ValueError):
                        return Response({'error': 'A valid dispatcher is required.'}, status=status.HTTP_400_BAD_REQUEST)
                elif field_name == 'date':
                    corrected_value = parse_date(str(raw_value))
                    if corrected_value is None:
                        return Response({'error': 'Invalid date format. Use YYYY-MM-DD.'}, status=status.HTTP_400_BAD_REQUEST)
                elif field_name in {
                    'substitute_fee', 'ps_fee', 'water_fee', 'dispatcher_collection_fee',
                    'ftb', 'savings', 'trust_fund',
                }:
                    try:
                        corrected_value = Decimal(str(raw_value)) if raw_value != '' else None
                    except Exception:
                        return Response({'error': f'{field_name} must be a valid number.'}, status=status.HTTP_400_BAD_REQUEST)

                if corrected_value != old_value:
                    changes.append((field_name, str(old_value) if old_value is not None else '', str(corrected_value) if corrected_value is not None else '', corrected_value))

            for field_name, old_value, new_value, corrected_value in changes:
                setattr(remittance, field_name, corrected_value)
                RemittanceCorrection.objects.create(
                    daily_remittance=remittance,
                    field_name=field_name,
                    old_value=old_value,
                    new_value=new_value,
                    reason=reason.strip(),
                    admin=request.user,
                )
            if changes:
                remittance.save(update_fields=[change[0] for change in changes])

        return Response(self.get_serializer(remittance).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['GET'], url_path='corrections')
    def corrections(self, request, pk=None):
        remittance = self.get_object()
        corrections = RemittanceCorrection.objects.filter(
            daily_remittance=remittance,
        ).select_related('admin', 'dispatch_round').order_by('corrected_at')
        return Response(
            RemittanceCorrectionSerializer(corrections, many=True).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['GET', 'POST'], url_path='rounds')
    def rounds(self, request, pk=None):
        remittance = self.get_object()

        if request.method == 'GET':
            rounds_qs = remittance.rounds.all().order_by('round_number')
            serializer = DispatchRoundSerializer(rounds_qs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

        if remittance.is_finalized:
            return Response(
                {'error': 'This Daily Remittance has been finalized and can no longer be edited.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        payload = request.data.copy()
        payload['remittance'] = remittance.id
        serializer = DispatchRoundSerializer(data=payload)
        serializer.is_valid(raise_exception=True)

        try:
            serializer.save()
        except IntegrityError:
            return Response(
                {'error': 'This round number already exists for the selected remittance.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remittance.refresh_from_db()
        remittance_data = self.get_serializer(remittance).data
        return Response(
            {
                'message': 'Dispatch round added successfully.',
                'round': serializer.data,
                'remittance': remittance_data,
            },
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['POST'], url_path='finalize')
    def finalize(self, request, pk=None):
        remittance = self.get_object()
        if remittance.is_finalized:
            return Response(
                {'error': 'Daily Remittance is already finalized.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        remittance.is_finalized = True
        remittance.finalized_at = now()
        remittance.save(update_fields=['is_finalized', 'finalized_at'])
        return Response(self.get_serializer(remittance).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['DELETE'], url_path=r'rounds/(?P<round_id>[^/.]+)')
    def remove_round(self, request, pk=None, round_id=None):
        remittance = self.get_object()
        if remittance.is_finalized:
            return Response(
                {'error': 'This Daily Remittance has been finalized and can no longer be edited.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            dispatch_round = DispatchRound.objects.get(pk=round_id, remittance=remittance)
        except DispatchRound.DoesNotExist:
            return Response({'error': 'Dispatch round not found.'}, status=status.HTTP_404_NOT_FOUND)
        dispatch_round.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def dispatch_round_admin_correct_view(request, pk=None):
    if not _has_admin_role(request):
        return Response(
            {'error': 'Only admin users can create remittance corrections.'},
            status=status.HTTP_403_FORBIDDEN,
        )

    reason = request.data.get('reason')
    if not isinstance(reason, str) or not reason.strip():
        return Response(
            {'error': 'A non-empty reason is required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    with transaction.atomic():
        try:
            dispatch_round = DispatchRound.objects.select_for_update().select_related('remittance').get(pk=pk)
        except DispatchRound.DoesNotExist:
            return Response({'error': 'Dispatch round not found.'}, status=status.HTTP_404_NOT_FOUND)

        remittance = DailyRemittance.objects.select_for_update().get(pk=dispatch_round.remittance.pk)
        if not remittance.is_finalized:
            return Response(
                {'error': 'Only finalized Daily Remittances can be corrected.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        changes = []
        if 'amount' in request.data:
            try:
                corrected_amount = Decimal(str(request.data['amount']))
            except Exception:
                return Response({'error': 'amount must be a valid number.'}, status=status.HTTP_400_BAD_REQUEST)
            if corrected_amount != dispatch_round.amount:
                changes.append(('amount', str(dispatch_round.amount), str(corrected_amount), corrected_amount))

        if 'departure_time' in request.data:
            corrected_time = parse_time(str(request.data['departure_time']))
            if corrected_time is None:
                return Response({'error': 'Invalid departure_time format. Use HH:MM[:ss].'}, status=status.HTTP_400_BAD_REQUEST)
            if corrected_time != dispatch_round.departure_time:
                changes.append(('departure_time', str(dispatch_round.departure_time), str(corrected_time), corrected_time))

        for field_name, old_value, new_value, corrected_value in changes:
            setattr(dispatch_round, field_name, corrected_value)
            RemittanceCorrection.objects.create(
                daily_remittance=remittance,
                dispatch_round=dispatch_round,
                field_name=field_name,
                old_value=old_value,
                new_value=new_value,
                reason=reason.strip(),
                admin=request.user,
            )
        if changes:
            dispatch_round.save(update_fields=[change[0] for change in changes])

    return Response(DispatchRoundSerializer(dispatch_round).data, status=status.HTTP_200_OK)


class ManifestTripViewSet(viewsets.ModelViewSet):
    queryset = ManifestTrip.objects.all().order_by('-date', '-id')
    serializer_class = ManifestTripSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')

    def perform_create(self, serializer):
        serializer.save(cashier=self.request.user)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.queryset)
        date_param = request.query_params.get('date')
        if date_param:
            manifest_date = parse_date(date_param)
            if manifest_date is None:
                return Response(
                    {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(date=manifest_date)

        finalized_param = request.query_params.get('is_finalized')
        if finalized_param is not None:
            if finalized_param.lower() not in {'true', 'false'}:
                return Response(
                    {'error': 'is_finalized must be true or false.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            queryset = queryset.filter(is_finalized=finalized_param.lower() == 'true')

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['POST'], url_path='finalize')
    def finalize(self, request, pk=None):
        manifest = self.get_object()

        if manifest.is_finalized:
            return Response(
                {'error': 'ManifestTrip is already finalized.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        departure_time = request.data.get('departure_time')
        if not departure_time:
            return Response(
                {'error': 'departure_time is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        manifest.departure_time = departure_time
        manifest.is_finalized = True
        manifest.finalized_at = now()
        manifest.save()

        serializer = self.get_serializer(manifest)

        entries = FareManifestEntry.objects.filter(
            manifest_trip=manifest,
        ).order_by('destination__destination_name')
        return Response(
            {
                'manifest_trip': serializer.data,
                'entries': FareManifestEntrySerializer(entries, many=True).data,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['POST'], url_path='cancel')
    def cancel(self, request, pk=None):
        with transaction.atomic():
            manifest = ManifestTrip.objects.select_for_update().filter(id=pk).first()
            if manifest is None:
                return Response(
                    {'error': 'ManifestTrip not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if manifest.is_finalized:
                return Response(
                    {'error': 'Cannot cancel a finalized Travel Pass.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            passenger_count = FareManifestEntry.objects.filter(
                manifest_trip=manifest,
                passenger_count__gt=0,
            ).aggregate(total=Sum('passenger_count'))['total'] or 0
            had_passengers = passenger_count > 0
            object_repr = f'{manifest.vehicle.plate_number} - {manifest.date} (had_passengers={had_passengers}, passenger_count={passenger_count})'

            FareManifestEntry.objects.filter(manifest_trip=manifest).delete()
            manifest.delete()
            log_admin_action(request.user, 'deleted', manifest, model_name='ManifestTrip', object_repr=object_repr)

        return Response(
            {
                'message': 'Travel Pass cancelled successfully.',
                'had_passengers': had_passengers,
                'passenger_count': passenger_count,
            },
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['POST'], url_path='admin-correct')
    def admin_correct(self, request, pk=None):
        if not _has_admin_role(request):
            return Response(
                {'error': 'Only admin users can create manifest corrections.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = request.data.get('reason')
        if not isinstance(reason, str) or not reason.strip():
            return Response(
                {'error': 'A non-empty reason is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                manifest = ManifestTrip.objects.select_for_update().get(pk=pk)
            except ManifestTrip.DoesNotExist:
                return Response(
                    {'error': 'ManifestTrip not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            if not manifest.is_finalized:
                return Response(
                    {'error': 'Only finalized Travel Passes can be corrected.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            changes = []
            if 'vehicle' in request.data:
                try:
                    vehicle = Vehicle.objects.get(pk=request.data['vehicle'])
                except (Vehicle.DoesNotExist, TypeError, ValueError):
                    return Response(
                        {'error': 'A valid vehicle is required.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if vehicle.pk != manifest.vehicle.pk:
                    changes.append(('vehicle', str(manifest.vehicle), str(vehicle), vehicle))

            if 'date' in request.data:
                corrected_date = parse_date(str(request.data['date']))
                if corrected_date is None:
                    return Response(
                        {'error': 'Invalid date format. Use YYYY-MM-DD.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if corrected_date != manifest.date:
                    changes.append(('date', manifest.date.isoformat(), corrected_date.isoformat(), corrected_date))

            if 'departure_time' in request.data:
                raw_time = request.data['departure_time']
                corrected_time = parse_time(str(raw_time)) if raw_time else None
                if raw_time and corrected_time is None:
                    return Response(
                        {'error': 'Invalid departure_time format. Use HH:MM[:ss].'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if corrected_time != manifest.departure_time:
                    old_value = manifest.departure_time.isoformat() if manifest.departure_time else ''
                    new_value = corrected_time.isoformat() if corrected_time else ''
                    changes.append(('departure_time', old_value, new_value, corrected_time))

            for field_name, old_value, new_value, corrected_value in changes:
                setattr(manifest, field_name, corrected_value)
                ManifestCorrection.objects.create(
                    manifest_trip=manifest,
                    field_name=field_name,
                    old_value=old_value,
                    new_value=new_value,
                    reason=reason.strip(),
                    admin=request.user,
                )

            if changes:
                manifest.save(update_fields=[change[0] for change in changes])

        return Response(self.get_serializer(manifest).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['GET'], url_path='corrections')
    def corrections(self, request, pk=None):
        manifest = self.get_object()
        corrections = ManifestCorrection.objects.filter(
            manifest_trip=manifest,
        ).select_related('admin', 'entry__destination').order_by('corrected_at')
        return Response(
            ManifestCorrectionSerializer(corrections, many=True).data,
            status=status.HTTP_200_OK,
        )

    @action(detail=True, methods=['POST'], url_path='generate-from-rfid')
    def generate_from_rfid(self, request, pk=None):
        manifest = self.get_object()
        if manifest.trip is None:
            return Response(
                {'error': 'ManifestTrip has no linked trip. Set trip before generating RFID entries.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        fare_txns = (
            Transaction.objects.filter(
                trip=manifest.trip,
                transaction_type=Transaction.TransactionType.FARE,
                destination__isnull=False,
            )
            .select_related('destination', 'card__passenger')
            .order_by('id')
        )

        grouped = {}
        for txn in fare_txns:
            destination_id = txn.destination_id
            if destination_id not in grouped:
                grouped[destination_id] = {
                    'destination': txn.destination,
                    'passenger_count': 0,
                    'discount_count': 0,
                    'total_fare': Decimal('0.00'),
                }

            grouped[destination_id]['passenger_count'] += 1
            grouped[destination_id]['total_fare'] += txn.amount

            passenger = txn.card.passenger
            if (
                passenger is not None
                and passenger.discount_type
                in {
                    Passenger.DiscountType.STUDENT,
                    Passenger.DiscountType.SENIOR,
                    Passenger.DiscountType.PWD,
                }
            ):
                grouped[destination_id]['discount_count'] += 1

        with transaction.atomic():
            FareManifestEntry.objects.filter(
                manifest_trip=manifest,
                source=FareManifestEntry.Source.RFID,
            ).delete()

            new_entries = [
                FareManifestEntry(
                    manifest_trip=manifest,
                    destination=data['destination'],
                    passenger_count=data['passenger_count'],
                    discount_count=data['discount_count'],
                    total_fare=data['total_fare'],
                    source=FareManifestEntry.Source.RFID,
                )
                for data in grouped.values()
            ]

            if new_entries:
                FareManifestEntry.objects.bulk_create(new_entries)

        created_entries = FareManifestEntry.objects.filter(
            manifest_trip=manifest,
            source=FareManifestEntry.Source.RFID,
        ).order_by('destination__destination_name')

        serializer = FareManifestEntrySerializer(created_entries, many=True)
        return Response(
            {
                'message': 'RFID manifest entries generated successfully.',
                'manifest_trip_id': manifest.id,
                'generated_count': len(serializer.data),
                'entries': serializer.data,
            },
            status=status.HTTP_200_OK,
        )


class FareManifestEntryViewSet(viewsets.ModelViewSet):
    queryset = FareManifestEntry.objects.all()
    serializer_class = FareManifestEntrySerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.manifest_trip.is_finalized:
            return Response(
                {'error': 'This Travel Pass has been finalized and can no longer be edited.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().update(request, *args, **kwargs)

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        if instance.manifest_trip.is_finalized:
            return Response(
                {'error': 'This Travel Pass has been finalized and can no longer be edited.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)

    @action(detail=True, methods=['POST'], url_path='admin-correct')
    def admin_correct(self, request, pk=None):
        if not _has_admin_role(request):
            return Response(
                {'error': 'Only admin users can create manifest corrections.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        reason = request.data.get('reason')
        if not isinstance(reason, str) or not reason.strip():
            return Response(
                {'error': 'A non-empty reason is required.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        with transaction.atomic():
            try:
                entry = FareManifestEntry.objects.select_for_update().select_related(
                    'manifest_trip', 'destination'
                ).get(pk=pk)
            except FareManifestEntry.DoesNotExist:
                return Response(
                    {'error': 'Manifest entry not found.'},
                    status=status.HTTP_404_NOT_FOUND,
                )

            manifest = ManifestTrip.objects.select_for_update().get(pk=entry.manifest_trip.pk)
            if not manifest.is_finalized:
                return Response(
                    {'error': 'Only finalized Travel Pass entries can be corrected.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            new_passenger_count = entry.passenger_count
            new_discount_count = entry.discount_count
            changes = []

            for field_name in ('passenger_count', 'discount_count'):
                if field_name not in request.data:
                    continue
                try:
                    corrected_value = int(request.data[field_name])
                except (TypeError, ValueError):
                    return Response(
                        {field_name: 'Must be a non-negative integer.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                if corrected_value < 0:
                    return Response(
                        {field_name: 'Must be a non-negative integer.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                old_value = getattr(entry, field_name)
                if corrected_value != old_value:
                    changes.append((field_name, str(old_value), str(corrected_value)))
                if field_name == 'passenger_count':
                    new_passenger_count = corrected_value
                else:
                    new_discount_count = corrected_value

            if new_discount_count > new_passenger_count:
                return Response(
                    {'error': 'discount_count cannot be greater than passenger_count.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            entry.passenger_count = new_passenger_count
            entry.discount_count = new_discount_count
            _recompute_manifest_entry_total(entry)
            entry.save(update_fields=['passenger_count', 'discount_count', 'total_fare'])

            for field_name, old_value, new_value in changes:
                ManifestCorrection.objects.create(
                    manifest_trip=manifest,
                    entry=entry,
                    field_name=field_name,
                    old_value=old_value,
                    new_value=new_value,
                    reason=reason.strip(),
                    admin=request.user,
                )

        return Response(FareManifestEntrySerializer(entry).data, status=status.HTTP_200_OK)

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.queryset.order_by('manifest_trip_id', 'destination_id'))
        manifest_trip_id = request.GET.get('manifest_trip')
        if manifest_trip_id:
            queryset = queryset.filter(manifest_trip_id=manifest_trip_id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


def _manifest_tally_payload(request):
    manifest_trip_id = request.data.get('manifest_trip')
    destination_id = request.data.get('destination')
    passenger_type = request.data.get('passenger_type')

    if not manifest_trip_id or not destination_id or not passenger_type:
        return None, Response(
            {'error': 'manifest_trip, destination, and passenger_type are required.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if passenger_type not in {'regular', 'discount'}:
        return None, Response(
            {'error': 'passenger_type must be regular or discount.'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return (manifest_trip_id, destination_id, passenger_type), None


def _recompute_manifest_entry_total(entry):
    entry.total_fare = (
        (entry.passenger_count - entry.discount_count) * entry.destination.base_fare
        + entry.discount_count * entry.destination.discount_fare
    )


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def manifest_entry_tally_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('tally manifest entries')

    payload, error_response = _manifest_tally_payload(request)
    if error_response is not None:
        return error_response

    assert payload is not None
    manifest_trip_id, destination_id, passenger_type = payload
    with transaction.atomic():
        manifest = ManifestTrip.objects.select_for_update().filter(id=manifest_trip_id).first()
        if manifest is None:
            return Response({'error': 'ManifestTrip not found.'}, status=status.HTTP_404_NOT_FOUND)
        if manifest.is_finalized:
            return Response(
                {'error': 'Cannot tally a finalized ManifestTrip.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        destination = Destination.objects.filter(id=destination_id, is_active=True).first()
        if destination is None:
            return Response({'error': 'Destination not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)
        if passenger_type == 'discount' and destination.discount_exempt:
            return Response(
                {'error': 'This destination does not allow discount fares.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry = FareManifestEntry.objects.select_for_update().filter(
            manifest_trip=manifest,
            destination=destination,
        ).first()
        if entry is None:
            entry = FareManifestEntry(
                manifest_trip=manifest,
                destination=destination,
                passenger_count=0,
                discount_count=0,
                total_fare=Decimal('0.00'),
                source=FareManifestEntry.Source.MANUAL,
            )

        entry.passenger_count += 1
        if passenger_type == 'discount':
            entry.discount_count += 1
        _recompute_manifest_entry_total(entry)
        entry.save()

    return Response(FareManifestEntrySerializer(entry).data, status=status.HTTP_200_OK)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def manifest_entry_untally_view(request):
    if not _has_cashier_or_admin_role(request):
        return _role_forbidden_response('untally manifest entries')

    payload, error_response = _manifest_tally_payload(request)
    if error_response is not None:
        return error_response

    assert payload is not None
    manifest_trip_id, destination_id, passenger_type = payload
    with transaction.atomic():
        manifest = ManifestTrip.objects.select_for_update().filter(id=manifest_trip_id).first()
        if manifest is None:
            return Response({'error': 'ManifestTrip not found.'}, status=status.HTTP_404_NOT_FOUND)
        if manifest.is_finalized:
            return Response(
                {'error': 'Cannot untally a finalized ManifestTrip.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        destination = Destination.objects.filter(id=destination_id, is_active=True).first()
        if destination is None:
            return Response({'error': 'Destination not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)

        entry = FareManifestEntry.objects.select_for_update().filter(
            manifest_trip=manifest,
            destination=destination,
        ).first()
        if entry is None:
            return Response(
                {'error': 'No manifest entry exists for this trip and destination.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if entry.passenger_count <= 0:
            return Response(
                {'error': 'Cannot untally because passenger_count is already zero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if passenger_type == 'regular' and entry.passenger_count - entry.discount_count <= 0:
            return Response(
                {
                    'error': (
                        'Cannot remove a regular tally when all remaining passengers '
                        'on this destination are discount.'
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if passenger_type == 'discount' and entry.discount_count <= 0:
            return Response(
                {'error': 'Cannot untally discount passenger because discount_count is already zero.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        entry.passenger_count -= 1
        if passenger_type == 'discount':
            entry.discount_count -= 1
        _recompute_manifest_entry_total(entry)
        entry.save()

    return Response(FareManifestEntrySerializer(entry).data, status=status.HTTP_200_OK)


class DestinationViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    serializer_class = DestinationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Destination.objects.all().order_by('base_fare', 'destination_name')
        # Apply is_active filter only if ?active_only=true is passed
        active_only = self.request.query_params.get('active_only', '').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify destinations.')


class VehicleViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    serializer_class = VehicleSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        queryset = Vehicle.objects.all().order_by('plate_number')
        # Apply is_active filter only if ?active_only=true is passed
        active_only = self.request.query_params.get('active_only', '').lower() == 'true'
        if active_only:
            queryset = queryset.filter(is_active=True)
        return queryset

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify vehicles.')


class LineViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = Line.objects.all().order_by('name')
    serializer_class = LineSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify lines.')


class TerminalViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = Terminal.objects.all().order_by('name')
    serializer_class = TerminalSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify terminals.')


class DriverViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = Driver.objects.all().order_by('full_name')
    serializer_class = DriverSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify drivers.')


class DispatcherViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = Dispatcher.objects.all().order_by('full_name')
    serializer_class = DispatcherSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify dispatchers.')


class PassengerViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = Passenger.objects.all().order_by('full_name')
    serializer_class = PassengerSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify passengers.')


class CardViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = Card.objects.all().order_by('-date_issued')
    serializer_class = CardSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
        # For write operations (create, update, delete), admin only
        if self.request.method not in ['GET', 'HEAD', 'OPTIONS']:
            if not _has_admin_role(request):
                raise PermissionDenied('Only admin users can modify cards.')

    def perform_create(self, serializer):
        # Default status to 'active' if not provided
        if 'status' not in self.request.data:
            serializer.validated_data['status'] = Card.Status.ACTIVE
        super().perform_create(serializer)


class UserViewSet(AdminAuditMixin, viewsets.ModelViewSet):
    queryset = User.objects.all().order_by('username')
    serializer_class = UserAdminSerializer
    permission_classes = [IsAuthenticated]
    http_method_names = ['get', 'post', 'patch', 'head', 'options']

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_admin_role(request):
            raise PermissionDenied('Only admin users can access user management.')

    def partial_update(self, request, *args, **kwargs):
        update_data = {
            field: request.data[field]
            for field in ('role', 'is_active')
            if field in request.data
        }
        serializer = self.get_serializer(
            self.get_object(),
            data=update_data,
            partial=True,
        )
        serializer.is_valid(raise_exception=True)
        self.perform_update(serializer)
        return Response(serializer.data)

    @action(detail=True, methods=['post'], url_path='reset-password')
    def reset_password(self, request, pk=None):
        new_password = request.data.get('new_password')
        if not new_password:
            return Response(
                {'new_password': ['This field is required.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user = self.get_object()
        try:
            validate_password(new_password, user=user)
        except ValidationError as error:
            return Response(
                {'new_password': error.messages},
                status=status.HTTP_400_BAD_REQUEST,
            )

        user.set_password(new_password)
        user.save(update_fields=['password'])
        log_admin_action(
            request.user,
            'updated',
            user,
            changes={'password': ['(reset)', '(reset)']},
        )
        return Response({'message': 'Password reset successfully.'})
