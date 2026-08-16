from decimal import Decimal
from typing import Optional

from django.contrib.auth import authenticate
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils.dateparse import parse_date, parse_time
from django.utils.timezone import localdate, now
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, authentication_classes, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Card, DailyRemittance, Destination, DispatchRound, FareManifestEntry, ManifestCorrection, ManifestTrip, Passenger, Transaction, Trip, Vehicle
from .serializers import (
    CardSerializer,
    DailyRemittanceSerializer,
    DispatchRoundSerializer,
    FareManifestEntrySerializer,
    ManifestCorrectionSerializer,
    ManifestTripSerializer,
    DestinationSerializer,
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


@api_view(['POST'])
@permission_classes([AllowAny])
def tap_view(request):
    card_uid = request.data.get('card_uid')
    trip_id = request.data.get('trip_id')
    destination_id = request.data.get('destination_id')

    if not card_uid:
        return Response({'error': 'card_uid is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not destination_id:
        return Response({'error': 'destination_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        card = Card.objects.select_for_update().select_related('passenger').filter(uid=card_uid).first()
        if card is None:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        if card.status != Card.Status.ACTIVE:
            return Response({'error': 'Card is not active.'}, status=status.HTTP_400_BAD_REQUEST)

        destination = Destination.objects.filter(id=destination_id, is_active=True).first()
        if destination is None:
            return Response({'error': 'Destination not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)

        trip = None
        if trip_id is not None:
            from .models import Trip

            trip = Trip.objects.filter(id=trip_id).first()
            if trip is None:
                return Response({'error': 'Trip not found.'}, status=status.HTTP_404_NOT_FOUND)

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
            trip=trip,
            destination=destination,
            balance_after=card.balance,
        )

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


class DailyRemittanceViewSet(viewsets.ModelViewSet):
    queryset = DailyRemittance.objects.all().order_by('-date', '-id')
    serializer_class = DailyRemittanceSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')

    @action(detail=True, methods=['GET', 'POST'], url_path='rounds')
    def rounds(self, request, pk=None):
        remittance = self.get_object()

        if request.method == 'GET':
            rounds_qs = remittance.rounds.all().order_by('round_number')
            serializer = DispatchRoundSerializer(rounds_qs, many=True)
            return Response(serializer.data, status=status.HTTP_200_OK)

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

            FareManifestEntry.objects.filter(manifest_trip=manifest).delete()
            manifest.delete()

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


class DestinationViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Destination.objects.filter(is_active=True).order_by('base_fare', 'destination_name')
    serializer_class = DestinationSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')


class VehicleViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Vehicle.objects.filter(is_active=True).order_by('plate_number')
    serializer_class = VehicleSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
