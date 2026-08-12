from decimal import Decimal
from typing import Optional

from django.contrib.auth import authenticate
from django.db import IntegrityError, transaction
from django.db.models import Count, Q, Sum
from django.utils.dateparse import parse_date
from django.utils.timezone import localdate
from rest_framework import status, viewsets
from rest_framework.authtoken.models import Token
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.exceptions import PermissionDenied
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from .models import Card, DailyRemittance, DispatchRound, FareManifestEntry, ManifestTrip, Passenger, Route, Transaction
from .serializers import (
    CardSerializer,
    DailyRemittanceSerializer,
    DispatchRoundSerializer,
    FareManifestEntrySerializer,
    ManifestTripSerializer,
    RouteSerializer,
)


class HealthCheckView(APIView):
    permission_classes = [AllowAny]

    def get(self, request):
        return Response({'status': 'ok', 'service': 'fareback'})


def _has_cashier_or_admin_role(request):
    return getattr(request.user, 'role', None) in {'cashier', 'admin'}


def _role_forbidden_response(action_label):
    return Response(
        {'error': f'Only cashier or admin users can {action_label}.'},
        status=status.HTTP_403_FORBIDDEN,
    )


@api_view(['POST'])
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
    route_id = request.data.get('route_id')

    if not card_uid:
        return Response({'error': 'card_uid is required.'}, status=status.HTTP_400_BAD_REQUEST)
    if not route_id:
        return Response({'error': 'route_id is required.'}, status=status.HTTP_400_BAD_REQUEST)

    with transaction.atomic():
        card = Card.objects.select_for_update().select_related('passenger').filter(uid=card_uid).first()
        if card is None:
            return Response({'error': 'Card not found.'}, status=status.HTTP_404_NOT_FOUND)
        if card.status != Card.Status.ACTIVE:
            return Response({'error': 'Card is not active.'}, status=status.HTTP_400_BAD_REQUEST)

        route = Route.objects.filter(id=route_id, is_active=True).first()
        if route is None:
            return Response({'error': 'Route not found or inactive.'}, status=status.HTTP_404_NOT_FOUND)

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
            fare = route.discount_fare
            fare_type = 'discount'
            reason = f'Discount fare applied for passenger type: {passenger_discount_type}.'
        else:
            fare = route.base_fare
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
            route=route,
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
                route__isnull=False,
            )
            .select_related('route', 'card__passenger')
            .order_by('id')
        )

        grouped = {}
        for txn in fare_txns:
            route_id = txn.route_id
            if route_id not in grouped:
                grouped[route_id] = {
                    'route': txn.route,
                    'passenger_count': 0,
                    'discount_count': 0,
                    'total_fare': Decimal('0.00'),
                }

            grouped[route_id]['passenger_count'] += 1
            grouped[route_id]['total_fare'] += txn.amount

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
                grouped[route_id]['discount_count'] += 1

        with transaction.atomic():
            FareManifestEntry.objects.filter(
                manifest_trip=manifest,
                source=FareManifestEntry.Source.RFID,
            ).delete()

            new_entries = [
                FareManifestEntry(
                    manifest_trip=manifest,
                    route=data['route'],
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
        ).order_by('route__destination_name')

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

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.queryset.order_by('manifest_trip_id', 'route_id'))
        manifest_trip_id = request.GET.get('manifest_trip')
        if manifest_trip_id:
            queryset = queryset.filter(manifest_trip_id=manifest_trip_id)

        page = self.paginate_queryset(queryset)
        if page is not None:
            serializer = self.get_serializer(page, many=True)
            return self.get_paginated_response(serializer.data)

        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class RouteViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Route.objects.filter(is_active=True).order_by('destination_name')
    serializer_class = RouteSerializer
    permission_classes = [IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if not _has_cashier_or_admin_role(request):
            raise PermissionDenied('Only cashier or admin users can access this endpoint.')
